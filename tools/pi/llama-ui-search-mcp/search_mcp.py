#!/usr/bin/env python3
"""Tiny stdio MCP web search server for llama-ui.

Uses the local SearXNG JSON endpoint and optionally fetches pages, converting
HTML to readable plain Markdown-ish text using only Python stdlib.
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from umcp import MCPServer  # noqa: E402

DEFAULT_SEARX_URL = "http://192.168.1.100:3080/search"
DEFAULT_TIMEOUT = 15
MAX_LIMIT = 10
MAX_FETCH_LIMIT = 3
MAX_CONTENT_CHARS = 12000


class MarkdownExtractor(HTMLParser):
    """Small stdlib HTML-to-Markdown converter for article-like pages."""

    skip_tags = {"script", "style", "noscript", "iframe", "svg", "canvas"}
    heading_tags = {"h1": "#", "h2": "##", "h3": "###", "h4": "####", "h5": "#####", "h6": "######"}

    def __init__(self, base_url: str = "") -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.parts: list[str] = []
        self.skip_depth = 0
        self.link_href: str | None = None
        self.link_text: list[str] = []
        self.list_depth = 0
        self.pre_depth = 0

    def _newline(self, count: int = 1) -> None:
        self.parts.append("\n" * count)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in self.skip_tags:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        attrs_dict = dict(attrs)
        if tag in self.heading_tags:
            self._newline(2)
            self.parts.append(f"{self.heading_tags[tag]} ")
        elif tag in {"p", "section", "article", "main", "blockquote"}:
            self._newline(2)
            if tag == "blockquote":
                self.parts.append("> ")
        elif tag == "br":
            self._newline()
        elif tag in {"ul", "ol"}:
            self.list_depth += 1
            self._newline()
        elif tag == "li":
            self._newline()
            self.parts.append("  " * max(0, self.list_depth - 1) + "- ")
        elif tag in {"strong", "b"}:
            self.parts.append("**")
        elif tag in {"em", "i"}:
            self.parts.append("_")
        elif tag == "code" and not self.pre_depth:
            self.parts.append("`")
        elif tag == "pre":
            self.pre_depth += 1
            self._newline(2)
            self.parts.append("```\n")
        elif tag == "a":
            href = attrs_dict.get("href")
            if href:
                self.link_href = urllib.parse.urljoin(self.base_url, href)
                self.link_text = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self.skip_tags and self.skip_depth:
            self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag in self.heading_tags:
            self._newline(2)
        elif tag in {"p", "section", "article", "main", "blockquote"}:
            self._newline(2)
        elif tag in {"ul", "ol"}:
            self.list_depth = max(0, self.list_depth - 1)
            self._newline()
        elif tag in {"strong", "b"}:
            self.parts.append("**")
        elif tag in {"em", "i"}:
            self.parts.append("_")
        elif tag == "code" and not self.pre_depth:
            self.parts.append("`")
        elif tag == "pre" and self.pre_depth:
            self.parts.append("\n```")
            self.pre_depth -= 1
            self._newline(2)
        elif tag == "a" and self.link_href:
            text = "".join(self.link_text).strip()
            if text:
                self.parts.append(f"]({self.link_href})")
            self.link_href = None
            self.link_text = []

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        if self.link_href:
            if not self.link_text:
                self.parts.append("[")
            self.link_text.append(data)
        self.parts.append(data)

    def markdown(self) -> str:
        raw = html.unescape("".join(self.parts))
        if not self.pre_depth:
            raw = re.sub(r"[ \t\r\f\v]+", " ", raw)
        raw = re.sub(r" *\n *", "\n", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


class TextExtractor(HTMLParser):
    skip_tags = {"script", "style", "noscript", "iframe", "svg", "canvas"}
    block_tags = {
        "article", "main", "section", "div", "p", "br", "hr", "li", "ul", "ol",
        "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "table", "tr",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0
        self.links: list[tuple[str, str]] = []
        self._link_href: str | None = None
        self._link_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in self.skip_tags:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag in self.block_tags:
            self.parts.append("\n")
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self._link_href = href
                self._link_text = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self.skip_tags and self.skip_depth:
            self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag == "a" and self._link_href:
            txt = "".join(self._link_text).strip()
            if txt:
                self.links.append((txt, self._link_href))
            self._link_href = None
            self._link_text = []
        if tag in self.block_tags:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        if self._link_href:
            self._link_text.append(data)
        self.parts.append(data)

    def text(self) -> str:
        raw = html.unescape("".join(self.parts))
        raw = re.sub(r"[ \t\r\f\v]+", " ", raw)
        raw = re.sub(r"\n\s*\n\s*\n+", "\n\n", raw)
        raw = re.sub(r" *\n *", "\n", raw)
        return raw.strip()


def fetch_json(url: str, timeout: int) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "llama-ui-search-mcp/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if r.status >= 400:
            raise RuntimeError(f"HTTP {r.status} from {url}")
        return json.loads(r.read().decode("utf-8", errors="replace"))


def fetch_text(url: str, timeout: int) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "llama-ui-search-mcp/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if r.status >= 400:
            raise RuntimeError(f"HTTP {r.status} from {url}")
        charset = r.headers.get_content_charset() or "utf-8"
        return r.read().decode(charset, errors="replace")


def html_to_markdown(markup: str, base_url: str = "") -> str:
    parser = MarkdownExtractor(base_url=base_url)
    parser.feed(markup)
    text = parser.markdown()
    return text[:MAX_CONTENT_CHARS]


def html_to_text(markup: str) -> str:
    # Backwards-compatible alias for search results. This now returns Markdown.
    return html_to_markdown(markup)


class SearchMCP(MCPServer):
    """Web search tools for llama-ui."""

    def tool_search_web(
        self,
        query: str,
        limit: int = 5,
        fetch: bool = False,
        fetch_limit: int = 2,
        searx_url: str = DEFAULT_SEARX_URL,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> dict[str, Any]:
        """Search the web via SearXNG and optionally fetch result pages.

        Args:
            query: Search query.
            limit: Number of search results to return, maximum 10.
            fetch: Whether to fetch and extract text from top result pages.
            fetch_limit: Number of result pages to fetch, maximum 3.
            searx_url: SearXNG search endpoint.
            timeout: HTTP timeout in seconds.

        Returns:
            Search results with title, url, snippet, and optional content.
        """
        q = (query or "").strip()
        if not q:
            raise ValueError("query is required")
        limit = max(1, min(int(limit), MAX_LIMIT))
        fetch_limit = max(0, min(int(fetch_limit), MAX_FETCH_LIMIT))
        timeout = max(1, min(int(timeout), 60))
        params = urllib.parse.urlencode({"q": q, "format": "json"})
        url = f"{searx_url}?{params}"
        data = fetch_json(url, timeout)
        out: list[dict[str, Any]] = []
        for item in (data.get("results") or [])[:limit]:
            out.append({
                "title": item.get("title") or "",
                "url": item.get("url") or "",
                "snippet": item.get("content") or "",
            })
        if fetch:
            for item in out[:fetch_limit]:
                try:
                    item["content"] = html_to_markdown(fetch_text(item["url"], timeout), item["url"])
                except Exception as exc:  # noqa: BLE001 - return tool-readable failure
                    item["content"] = f"Failed to fetch: {exc}"
        return {"query": q, "searx_url": searx_url, "limit": limit, "fetch": fetch, "results": out}

    def tool_fetch_url(self, url: str, timeout: int = DEFAULT_TIMEOUT, max_chars: int = MAX_CONTENT_CHARS) -> dict[str, Any]:
        """Fetch a specific URL and return extracted Markdown content.

        Args:
            url: HTTP or HTTPS URL to fetch.
            timeout: HTTP timeout in seconds.
            max_chars: Maximum number of Markdown characters to return.

        Returns:
            URL, detected title if available, and Markdown content.
        """
        u = (url or "").strip()
        if not (u.startswith("http://") or u.startswith("https://")):
            raise ValueError("url must start with http:// or https://")
        timeout = max(1, min(int(timeout), 60))
        max_chars = max(1000, min(int(max_chars), 50000))
        html_text = fetch_text(u, timeout)
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.IGNORECASE | re.DOTALL)
        title = ""
        if title_match:
            title = re.sub(r"\s+", " ", html.unescape(title_match.group(1))).strip()
        markdown = html_to_markdown(html_text, u)[:max_chars]
        return {"url": u, "title": title, "content": markdown, "content_type": "text/markdown"}


if __name__ == "__main__":
    SearchMCP().run()
