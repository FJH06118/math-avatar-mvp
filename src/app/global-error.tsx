"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <html lang="zh-CN">
      <body>
        <main
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            fontFamily:
              '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
            background: "#dce9df",
            color: "#26342d",
          }}
        >
          <section
            role="alert"
            aria-labelledby="global-error-title"
            style={{
              maxWidth: "480px",
              padding: "24px",
              border: "1px solid #bac9bf",
              borderRadius: "10px",
              background: "#faf9f3",
              textAlign: "center",
              boxShadow: "0 18px 50px rgba(32, 55, 42, 0.1)",
            }}
          >
            <h1
              ref={headingRef}
              id="global-error-title"
              tabIndex={-1}
              style={{ outline: "none" }}
            >
              应用暂时无法显示
            </h1>
            <p>请重新加载应用。已保存的项目数据不会受到影响。</p>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "44px",
                padding: "0 16px",
                border: 0,
                borderRadius: "8px",
                background: "#246445",
                color: "#ffffff",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              重新加载应用
            </button>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                minHeight: "44px",
                marginLeft: "8px",
                alignItems: "center",
                padding: "0 16px",
                border: "1px solid #bac9bf",
                borderRadius: "8px",
                color: "#26342d",
                textDecoration: "none",
              }}
            >
              返回首页
            </Link>
          </section>
        </main>
      </body>
    </html>
  );
}
