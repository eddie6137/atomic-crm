export const COMMENTS_RESOURCE = "eos_commitment_comments";
export const COMMENT_MAX = 4000;

/** Client mirror of the DB CHECK char_length(btrim(body)) between 1 and 4000. */
export const commentBodyError = (body: string) => {
  const t = body.trim();
  if (!t) return "Write a comment first";
  if (t.length > COMMENT_MAX) return `Keep it under ${COMMENT_MAX} characters`;
  return null;
};
