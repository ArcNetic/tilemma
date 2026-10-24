export const cleanLeanMessage = (raw: string, limit = 400): string => {
  const withoutPrefix = raw.replace(/^PP_[A-Z_]+\s*/, "");
  const collapsed = withoutPrefix.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}...` : collapsed;
};
