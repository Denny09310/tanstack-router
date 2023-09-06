import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/posts/manage').createRoute({
  component: () => <div>Manage Posts</div>,
});
