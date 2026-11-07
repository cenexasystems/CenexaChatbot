// Single place to control the Graph API version used by every Meta call.
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v25.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
