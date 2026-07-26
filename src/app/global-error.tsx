"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
            background: "#f7f7fb",
            color: "#26283a",
          }}
        >
          <section
            role="alert"
            aria-labelledby="global-error-title"
            style={{
              maxWidth: "480px",
              padding: "24px",
              border: "1px solid #dedfeb",
              borderRadius: "16px",
              background: "#ffffff",
              textAlign: "center",
            }}
          >
            <h1 id="global-error-title">应用暂时无法显示</h1>
            <p>请重新加载应用。已保存的项目数据不会受到影响。</p>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "44px",
                padding: "0 16px",
                border: 0,
                borderRadius: "12px",
                background: "#4f46e5",
                color: "#ffffff",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              重新加载应用
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
