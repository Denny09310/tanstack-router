import { Link, Outlet } from "@tanstack/react-router";
import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/posts/$postId/deep').createRoute({
  component: () => {
    const { postId } = route.useParams();
    return (
      <div className="flex flex-col gap-4">
        <Link to="/posts/$postId" params={{ postId }} className="block py-1 text-white">
          ← All Posts
        </Link>
        <Outlet />
      </div>
    );
  },
});
