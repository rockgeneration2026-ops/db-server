const baseUrl = (process.env.API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  console.log(`Checking blog API at ${baseUrl}`);

  const health = await getJson("/health");
  console.log("Health:", health);

  const list = await getJson("/blogs");
  const items = Array.isArray(list.items) ? list.items : [];

  console.log(`Blogs found: ${items.length}`);
  if (!items.length) {
    console.log("No published blogs were returned by /blogs.");
    return;
  }

  console.log("Blog list preview:");
  for (const blog of items) {
    console.log(`- ${blog.id}: ${blog.title} (${blog.slug}) [${blog.status}]`);
  }

  const firstSlug = items[0].slug;
  const detail = await getJson(`/blogs/${firstSlug}`);

  console.log("");
  console.log(`Single blog check for slug: ${firstSlug}`);
  console.log(
    JSON.stringify(
      {
        item: detail.item,
        seo: detail.seo
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Blog check failed.");
  console.error(error.message);
  process.exit(1);
});
