// Public Next.js variables are frozen into the browser bundle during the build.
const transport = process.env.NEXT_PUBLIC_DATA_TRANSPORT ?? "http";

if (!["http", "fixtures"].includes(transport)) {
  throw new Error("NEXT_PUBLIC_DATA_TRANSPORT must be http or fixtures.");
}

if (transport === "http") {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Set NEXT_PUBLIC_API_BASE_URL to the hosted HTTPS API origin in Vercel before building.",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname === "[::1]" ||
    url.hostname.startsWith("127.") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    value !== url.origin
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be a public HTTPS origin without credentials, a path, query, fragment, or trailing slash.",
    );
  }
}

console.log(`Vercel environment validated (${transport} transport).`);
