import { useEffect } from "react";

interface PageMetaOptions {
  title: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
}

/**
 * Sets page title, meta description, Open Graph, Twitter Card, and canonical URL.
 * Restores the previous values on unmount so navigating back restores defaults.
 */
export function usePageMeta({ title, description, ogImage, canonical }: PageMetaOptions) {
  useEffect(() => {
    const setMeta = (selector: string, attr: string, name: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
      if (!el) {
        el = document.createElement(selector.startsWith("link") ? "link" : "meta") as HTMLMetaElement;
        (el as HTMLMetaElement).setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (selector: string, rel: string, href: string) => {
      let el = document.querySelector<HTMLLinkElement>(selector);
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    // Save previous values for cleanup
    const prevTitle = document.title;
    const prevDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    const prevOgImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "";
    const prevCanonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";

    // Apply new values
    document.title = title;
    const canonicalUrl = canonical ?? `${window.location.origin}${window.location.pathname}`;

    if (description) {
      setMeta('meta[name="description"]', "name", "description", description);
      setMeta('meta[property="og:description"]', "property", "og:description", description);
      setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    }

    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setLink('link[rel="canonical"]', "canonical", canonicalUrl);

    if (ogImage) {
      setMeta('meta[property="og:image"]', "property", "og:image", ogImage);
      setMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
    }

    return () => {
      document.title = prevTitle;
      if (prevDesc) setMeta('meta[name="description"]', "name", "description", prevDesc);
      if (prevOgImage) setMeta('meta[property="og:image"]', "property", "og:image", prevOgImage);
      if (prevCanonical) setLink('link[rel="canonical"]', "canonical", prevCanonical);
    };
  }, [title, description, ogImage, canonical]);
}
