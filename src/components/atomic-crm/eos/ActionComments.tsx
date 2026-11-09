import { useMemo, useState } from "react";
import {
  useCreate,
  useGetList,
  useGetMany,
  useNotify,
  useRefresh,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { formatPT } from "./actionActivity";
import {
  COMMENT_MAX,
  COMMENTS_RESOURCE,
  commentBodyError,
} from "./actionComments";

/**
 * v1d U1b plain comments (staging-only migration eos_commitment_comments).
 * Append-only: no edit or delete. Author and time are set by the DB trigger.
 * Comments are never copied into eos_activity (separate logs).
 */
export const ActionComments = ({ commitmentId }: { commitmentId: string }) => {
  const [body, setBody] = useState("");
  const [create, { isPending: saving }] = useCreate();
  const notify = useNotify();
  const refresh = useRefresh();
  const { data, isPending, error } = useGetList(
    COMMENTS_RESOURCE,
    {
      filter: { commitment_id: commitmentId, "archived_at@is": null },
      sort: { field: "created_at", order: "DESC" },
      pagination: { page: 1, perPage: 100 },
    },
    { retry: false },
  );
  const authorIds = useMemo(
    () => [
      ...new Set(
        (data ?? [])
          .map((c: any) => c.created_by)
          .filter((x: unknown) => x != null)
          .map(String),
      ),
    ],
    [data],
  );
  const { data: authors } = useGetMany(
    "sales",
    { ids: authorIds },
    { enabled: authorIds.length > 0 },
  );
  const nameOf = (id: unknown) => {
    if (id == null) return "System";
    const s = (authors ?? []).find((a: any) => String(a.id) === String(id));
    return s
      ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim()
      : "Team member";
  };
  const err = body ? commentBodyError(body) : null;
  const submit = () => {
    const e = commentBodyError(body);
    if (e) {
      notify(e, { type: "error" });
      return;
    }
    create(
      COMMENTS_RESOURCE,
      // Only these two keys: created_by/created_at come from the DB trigger.
      { data: { commitment_id: commitmentId, body: body.trim() } },
      {
        onSuccess: () => {
          setBody("");
          notify("Comment added", { type: "success" });
          refresh();
        },
        onError: (e: any) =>
          notify(
            e?.message
              ? `Could not add comment: ${e.message}`
              : "Could not add comment",
            { type: "error" },
          ),
      },
    );
  };
  return (
    <div className="flex flex-col gap-2" data-testid="action-comments">
      <label htmlFor="action-comment-body" className="sr-only">
        Add a comment
      </label>
      <textarea
        id="action-comment-body"
        data-testid="action-comment-body"
        rows={2}
        maxLength={COMMENT_MAX + 200}
        placeholder="Add a comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        className="w-full min-h-11 rounded-md border bg-background px-3 py-2 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      {err && body.trim().length > COMMENT_MAX && (
        <p className="text-xs text-destructive">{err}</p>
      )}
      <Button
        size="sm"
        className="self-end min-h-11 md:min-h-8"
        data-testid="action-comment-submit"
        disabled={saving || !body.trim() || body.trim().length > COMMENT_MAX}
        onClick={submit}
      >
        Comment
      </Button>
      {isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading comments…
        </p>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Could not load comments.
        </p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm">
          {data.map((c: any) => (
            <li
              key={c.id}
              className="rounded-md border bg-muted/40 p-2"
              data-testid="action-comment"
            >
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {nameOf(c.created_by)}
                </span>{" "}
                · {formatPT(c.created_at)}
              </div>
              <p className="whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
