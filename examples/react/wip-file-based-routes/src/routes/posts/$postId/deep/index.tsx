import { fetchPost } from "@/utils";
import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/posts/$postId/deep/').createRoute({
  loader: ({ params: { postId } }) => fetchPost(postId),
  errorComponent: () => <div>Something went wrong</div>,
  component: () => {
    const post = route.useLoader();

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    );
  },
});
