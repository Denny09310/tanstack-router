import { route as rootRoute } from "./routes/__root"
import { route as PostsLayoutRoute } from "./routes/posts/_layout"
import { route as IndexRoute } from "./routes"
import { route as PostsIndexRoute } from "./routes/posts"
import { route as PostsPostIdDeepLayoutRoute } from "./routes/posts/$postId/deep/_layout"
import { route as PostsPostIdIndexRoute } from "./routes/posts/$postId"
import { route as PostsPostIdDeepIndexRoute } from "./routes/posts/$postId/deep"

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/": {
      parentRoute: typeof rootRoute
    }
    "/posts": {
      parentRoute: typeof rootRoute
    }
    "/posts/": {
      parentRoute: typeof PostsLayoutRoute
    }
    "/posts/$postId/": {
      parentRoute: typeof PostsLayoutRoute
    }
    "/posts/$postId/deep": {
      parentRoute: typeof rootRoute
    }
    "/posts/$postId/deep/": {
      parentRoute: typeof PostsPostIdDeepLayoutRoute
    }
  }
}

Object.assign(IndexRoute.options, {
  path: "/",
  getParentRoute: () => rootRoute,
})

Object.assign(PostsLayoutRoute.options, {
  path: "/posts",
  getParentRoute: () => rootRoute,
})

Object.assign(PostsIndexRoute.options, {
  path: "/",
  getParentRoute: () => PostsLayoutRoute,
})

Object.assign(PostsPostIdIndexRoute.options, {
  path: "/$postId/",
  getParentRoute: () => PostsLayoutRoute,
})

Object.assign(PostsPostIdDeepLayoutRoute.options, {
  path: "/posts/$postId/deep",
  getParentRoute: () => rootRoute,
})

Object.assign(PostsPostIdDeepIndexRoute.options, {
  path: "/",
  getParentRoute: () => PostsPostIdDeepLayoutRoute,
})

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  PostsLayoutRoute.addChildren([PostsIndexRoute, PostsPostIdIndexRoute]),
  PostsPostIdDeepLayoutRoute.addChildren([PostsPostIdDeepIndexRoute]),
])
