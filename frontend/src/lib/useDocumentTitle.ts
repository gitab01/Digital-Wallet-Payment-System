"use client";

import { useEffect } from "react";

const SUFFIX = " · Mela Wallet";

/** Client pages cannot export metadata, so the title is set declaratively here. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title.endsWith("Mela Wallet") ? title : `${title}${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
