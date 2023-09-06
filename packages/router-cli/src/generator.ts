import path from 'path'
import fs from 'fs-extra'
import * as prettier from 'prettier'
import { Config } from './config'
import { cleanPath, trimPathLeft } from '@tanstack/router-core'

let latestTask = 0
export const rootPathId = '__root'
export const fileRouteRegex = /new\s+FileRoute\(([^)]*)\)/g

export type RouteNode = {
  filePath: string
  fullPath: string
  variableName: string
  routePath?: string
  cleanedPath?: string
  path?: string
  isNonPath?: boolean
  isNonLayout?: boolean
  isRoot?: boolean
  children?: RouteNode[]
  parent?: RouteNode,
}

async function getRouteNodes(config: Config) {
  const { routeFilePrefix, routeFileIgnorePrefix } = config

  let routeNodes: RouteNode[] = []

  async function recurse(dir: string) {
    const fullDir = path.resolve(config.routesDirectory, dir)
    let dirList = await fs.readdir(fullDir)

    dirList = dirList.filter((d) => {
      if (
        d.startsWith('.') ||
        (routeFileIgnorePrefix && d.startsWith(routeFileIgnorePrefix))
      ) {
        return false
      }

      if (routeFilePrefix) {
        return d.startsWith(routeFilePrefix)
      }

      return true
    })

    await Promise.all(
      dirList.map(async (fileName) => {
        const fullPath = path.join(fullDir, fileName)
        const relativePath = path.join(dir, fileName)
        const stat = await fs.stat(fullPath)

        if (stat.isDirectory()) {
          await recurse(relativePath)
        } else {
          const filePath = path.join(dir, fileName)
          const filePathNoExt = removeExt(filePath)
          let routePath = replaceBackslash(cleanPath(`/${filePathNoExt.split('.').join('/')}`)) ?? ''
          const variableName = fileToVariable(routePath)

          // Remove the index from the route path and
          // if the route path is empty, use `/'
          if (routePath === '/index') {
            routePath = '/'
          } else if (routePath.endsWith('/index')) {
            routePath = routePath.replace(/\/index$/, '')
          }

          routeNodes.push({
            filePath,
            fullPath,
            routePath,
            variableName,
          })
        }
      }),
    )

    return routeNodes
  }

  await recurse('./')

  return routeNodes
}

let first = false
let skipMessage = false

export async function generator(config: Config) {
  if (!first) {
    console.log('🔄 Generating routes...')
    first = true
  } else if (skipMessage) {
    skipMessage = false
  } else {
    console.log('♻️  Regenerating routes...')
  }

  const taskId = latestTask + 1
  latestTask = taskId

  const checkLatest = () => {
    if (latestTask !== taskId) {
      skipMessage = true
      return false
    }

    return true
  }

  const start = Date.now()

  let routeNodes = await getRouteNodes(config)

  routeNodes = multiSortBy(routeNodes, [
    (d) => (d.routePath === '/' ? -1 : 1),
    (d) => d.routePath?.split('/').length,
    (d) => (d.routePath?.endsWith("_layout") ? -1 : 1),
    (d) => d.routePath,
  ]).filter((d) => d.routePath !== `/${rootPathId}`)

  const routeTree: RouteNode[] = []

  routeNodes.forEach((node) => {
    const parentRoute = hasParentRoute(routeNodes, node.routePath)
    if (parentRoute) node.parent = parentRoute

    node.path = node.parent
      ? node.routePath?.replace(node.parent.routePath!, '') || '/'
      : node.routePath

    const isLayout = node.routePath?.endsWith("/_layout")
    const trimmedPath = trimPathLeft(node.path ?? '')

    const split = trimmedPath?.split('/') ?? []
    let name = (isLayout ? split.pop() : split[0]) ?? trimmedPath ?? '';

    node.isNonPath = name.startsWith('_')
    node.isNonLayout = name.endsWith('_')

    node.cleanedPath = removeUnderscores(node.path) ?? ''

    if (isLayout) {
      const layoutChildRoute = node.routePath?.replace("/_layout", "");
      const layoutChild = routeNodes.find(d => d.routePath === layoutChildRoute)

      if (layoutChild) {
        layoutChild.parent = node;
        node.children = [layoutChild]

        removeExistingChild(routeTree, layoutChild.routePath!)
      }
    }

    if (node.parent) {
      node.parent.children ??= []
      node.parent.children.push(node)
    } else {
      routeTree.push(node)
    }
  })

  function removeExistingChild(tree: RouteNode[], routePath: string) {
    for (const child of tree) {
      const index = tree.findIndex(d => d.routePath === routePath)

      if (index > -1) {
        tree.splice(index, 1);
        return;
      }

      if (child.children) {
        removeExistingChild(child.children, routePath)
      }
    }
  }

  async function buildRouteConfig(
    nodes: RouteNode[],
    depth = 1,
  ): Promise<string> {
    const children = nodes.map(async (node) => {
      const routeCode = await fs.readFile(node.fullPath, 'utf-8')

      // Ensure the boilerplate for the route exists
      if (node.isRoot) {
        return
      }

      // Ensure that new FileRoute(anything?) is replace with FileRoute(${node.routePath})
      const replaced = routeCode.replace(
        fileRouteRegex,
        `new FileRoute('${node.routePath}')`,
      )

      if (replaced !== routeCode) {
        await fs.writeFile(node.fullPath, replaced)
      }

      const route = `${node.variableName}Route`

      if (node.children?.length) {
        const childConfigs = await buildRouteConfig(node.children, depth + 1)
        return `${route}.addChildren([${spaces(depth * 4)}${childConfigs}])`
      }

      return route
    })

    return (await Promise.all(children)).filter(Boolean).join(`,`)
  }

  const routeConfigChildrenText = await buildRouteConfig(routeTree)

  const routeImports = [
    `import { route as rootRoute } from './${sanitize(path.relative(
      path.dirname(config.generatedRouteTree),
      path.resolve(config.routesDirectory, rootPathId)))}'`,
    ...multiSortBy(routeNodes, [
      (d) => (d.routePath?.includes(`/${rootPathId}`) ? -1 : 1),
      (d) => d.routePath?.split('/').length,
      (d) => d,
    ]).map((node) => {
      return `import { route as ${node.variableName}Route } from './${sanitize(removeExt(
        path.relative(
          path.dirname(config.generatedRouteTree),
          path.resolve(config.routesDirectory, node.filePath),
        ),
      ))}'`
    }),
  ].join('\n')

  const routeTypes = `declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    ${routeNodes
      .map((routeNode) => {
        return `'${routeNode.routePath}': {
          parentRoute: typeof ${routeNode.parent?.variableName ?? 'root'}Route
        }`
      })
      .join('\n')}  
  }
}`

  const routeOptions = routeNodes
    .map((routeNode) => {
      return `Object.assign(${routeNode.variableName ?? 'root'}Route.options, {
        ${[routeNode.isNonPath
          ? `id: '${routeNode.cleanedPath}'`
          : `path: '${routeNode.cleanedPath}'`,
        `getParentRoute: () => ${routeNode.parent?.variableName ?? 'root'}Route`,
        ]
          .filter(Boolean)
          .join(',')}
      })`
    })
    .join('\n\n')

  const routeConfig = `export const routeTree = rootRoute.addChildren([${routeConfigChildrenText}])`

  const routeConfigFileContent = await prettier.format(
    [routeImports, routeTypes, routeOptions, routeConfig].join('\n\n'),
    {
      semi: false,
      parser: 'typescript',
    },
  )

  const routeTreeContent = await fs
    .readFile(path.resolve(config.generatedRouteTree), 'utf-8')
    .catch((err: any) => {
      if (err.code === 'ENOENT') {
        return undefined
      }
      throw err
    })

  if (!checkLatest()) return

  if (routeTreeContent !== routeConfigFileContent) {
    await fs.ensureDir(path.dirname(path.resolve(config.generatedRouteTree)))
    if (!checkLatest()) return
    await fs.writeFile(
      path.resolve(config.generatedRouteTree),
      routeConfigFileContent,
    )
  }

  console.log(
    `🌲 Processed ${routeNodes.length} routes in ${Date.now() - start}ms`,
  )
}

function fileToVariable(d: string): string {
  return (
    removeUnderscores(d)
      ?.replace(/\$/g, '')
      ?.split(/[/-]/g)
      .map((d, i) => (i > 0 ? capitalize(d) : d))
      .join('')
      .replace(/([^a-zA-Z0-9]|[\.])/gm, '') ?? ''
  )
}

export function removeExt(d: string) {
  return d.substring(0, d.lastIndexOf('.')) || d
}

function spaces(d: number): string {
  return Array.from({ length: d })
    .map(() => ' ')
    .join('')
}

export function multiSortBy<T>(
  arr: T[],
  accessors: ((item: T) => any)[] = [(d) => d],
): T[] {
  return arr
    .map((d, i) => [d, i] as const)
    .sort(([a, ai], [b, bi]) => {
      for (const accessor of accessors) {
        const ao = accessor(a)
        const bo = accessor(b)

        if (typeof ao === 'undefined') {
          if (typeof bo === 'undefined') {
            continue
          }
          return 1
        }

        if (ao === bo) {
          continue
        }

        return ao > bo ? 1 : -1
      }

      return ai - bi
    })
    .map(([d]) => d)
}

function capitalize(s: string) {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function sanitize(s?: string) {
  return replaceBackslash(s?.replace(/\\index/gi, ''))
}

function removeUnderscores(s?: string) {
  return s?.replace(/(^_|_$)/, '').replace(/(\/_|_\/)/, '/');
}

function replaceBackslash(s?: string) {
  return s?.replace(/\\/gi, '/')
}

function bubbleUp(routeToCheck: string) {
  const segments = routeToCheck.split("/");
  segments.pop();
  return segments.join("/");
}

function hasParentRoute(routes: RouteNode[], routeToCheck: string | undefined): RouteNode | null {
  if (!routeToCheck || routeToCheck === "/") {
    return null;
  }

  if (!routeToCheck.endsWith("/_layout")) {
    const orderedRoutes = multiSortBy(routes, [(d) => (d.routePath?.split('/').length ?? 0) * -1])

    for (const route of orderedRoutes) {
      if (route.routePath === '/') continue;
      if (routeToCheck.startsWith(`${route.routePath}/`) && route.routePath !== routeToCheck) {
        return route;
      }
    }
  }

  const parentRoute = bubbleUp(routeToCheck);
  return hasParentRoute(routes, parentRoute)
}
