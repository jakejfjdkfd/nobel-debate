const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");

const MAX_BYTES = 3_000_000;

function isValidUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = String(req.body?.url || "").trim();
  if (!url || !isValidUrl(url)) {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }
  if (/wikipedia\.org/i.test(url)) {
    res.status(400).json({ error: "Wikipedia sources are excluded" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "NobelResearchDesk/1.0 (+https://vercel.app) Mozilla/5.0",
      },
    });

    if (!response.ok) {
      res.status(400).json({ error: `Fetch failed: ${response.status}` });
      return;
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      res.status(413).json({ error: "Content too large" });
      return;
    }

    let html = await response.text();
    if (html.length > MAX_BYTES) {
      html = html.slice(0, MAX_BYTES);
    }

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      res.status(422).json({ error: "Unable to extract readable text" });
      return;
    }

    res.status(200).json({
      title: article.title || "",
      byline: article.byline || "",
      excerpt: article.excerpt || "",
      text: article.textContent || "",
    });
  } catch (error) {
    const message = error.name === "AbortError" ? "Fetch timeout" : error.message;
    res.status(500).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
};
