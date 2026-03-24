export const createMeta = (title, description, path) => ({
  title,
  description,
  canonical: `${process.env.APP_URL || "http://localhost:5173"}${path}`,
  openGraph: {
    title,
    description,
    url: `${process.env.APP_URL || "http://localhost:5173"}${path}`
  }
});
