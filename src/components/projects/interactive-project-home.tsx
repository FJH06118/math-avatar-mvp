"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FileUpIcon,
  FolderOpenIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

type HomeView = "intro" | "projects";
type ActionIntent = "course" | "projects" | "idle";

interface InteractiveProjectHomeProps {
  recentProjects: ReactNode;
}

function getEntrySide(
  event: PointerEvent<HTMLElement>,
): "top" | "right" | "bottom" | "left" {
  const rect = event.currentTarget.getBoundingClientRect();
  const distances = {
    top: Math.abs(event.clientY - rect.top),
    right: Math.abs(event.clientX - rect.right),
    bottom: Math.abs(event.clientY - rect.bottom),
    left: Math.abs(event.clientX - rect.left),
  };

  return (Object.entries(distances).sort(
    ([, first], [, second]) => first - second,
  )[0]?.[0] ?? "left") as "top" | "right" | "bottom" | "left";
}

function useMagneticMotion(reduceMotion: boolean | null) {
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const springX = useSpring(targetX, {
    stiffness: 260,
    damping: 26,
    mass: 0.55,
  });
  const springY = useSpring(targetY, {
    stiffness: 260,
    damping: 26,
    mass: 0.55,
  });
  const transform = useTransform(
    [springX, springY],
    ([x, y]) => `translate3d(${x}px, ${y}px, 0)`,
  );

  const move = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (
        reduceMotion ||
        event.pointerType !== "mouse" ||
        !window.matchMedia("(hover: hover) and (pointer: fine)").matches
      ) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      targetX.set((event.clientX - rect.left - rect.width / 2) * 0.12);
      targetY.set((event.clientY - rect.top - rect.height / 2) * 0.15);
    },
    [reduceMotion, targetX, targetY],
  );

  const reset = useCallback(() => {
    targetX.set(0);
    targetY.set(0);
  }, [targetX, targetY]);

  return { move, reset, transform };
}

export function InteractiveProjectHome({
  recentProjects,
}: InteractiveProjectHomeProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<HomeView>("intro");
  const [intent, setIntent] = useState<ActionIntent>("idle");
  const [isLeaving, setIsLeaving] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const projectsTitleRef = useRef<HTMLHeadingElement>(null);
  const homeTitleRef = useRef<HTMLHeadingElement>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const keyboardResetRef = useRef<number | null>(null);

  const visualTargetX = useMotionValue(0);
  const visualTargetY = useMotionValue(0);
  const visualSpringX = useSpring(visualTargetX, {
    stiffness: 105,
    damping: 19,
    mass: 0.8,
  });
  const visualSpringY = useSpring(visualTargetY, {
    stiffness: 105,
    damping: 19,
    mass: 0.8,
  });
  const visualTransform = useTransform(
    [visualSpringX, visualSpringY],
    ([x, y]) => {
      const latestX = x as number;
      const latestY = y as number;
      return `translate3d(${latestX * 12}px, ${
        latestY * 10
      }px, 0) rotateX(${latestY * -1.8}deg) rotateY(${
        latestX * 2.4
      }deg)`;
    },
  );

  const lightTargetX = useMotionValue(-150);
  const lightTargetY = useMotionValue(-150);
  const lightTargetOpacity = useMotionValue(0);
  const lightSpringX = useSpring(lightTargetX, {
    stiffness: 250,
    damping: 28,
    mass: 0.6,
  });
  const lightSpringY = useSpring(lightTargetY, {
    stiffness: 250,
    damping: 28,
    mass: 0.6,
  });
  const lightOpacity = useSpring(lightTargetOpacity, {
    stiffness: 220,
    damping: 28,
    mass: 0.6,
  });
  const lightTransform = useTransform(
    [lightSpringX, lightSpringY],
    ([x, y]) => `translate3d(${x}px, ${y}px, 0)`,
  );

  const {
    move: moveCourseMagnetic,
    reset: resetCourseMagnetic,
    transform: courseMagneticTransform,
  } = useMagneticMotion(reduceMotion);
  const {
    move: moveProjectsMagnetic,
    reset: resetProjectsMagnetic,
    transform: projectsMagneticTransform,
  } = useMagneticMotion(reduceMotion);

  const resetStagePointer = useCallback(() => {
    visualTargetX.set(0);
    visualTargetY.set(0);
    lightTargetOpacity.set(0);
  }, [lightTargetOpacity, visualTargetX, visualTargetY]);

  function handleStagePointerMove(event: PointerEvent<HTMLElement>) {
    if (
      reduceMotion ||
      event.pointerType !== "mouse" ||
      view !== "intro" ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    visualTargetX.set(x / rect.width - 0.5);
    visualTargetY.set(y / rect.height - 0.5);
    lightTargetX.set(x - 150);
    lightTargetY.set(y - 150);
    lightTargetOpacity.set(1);
  }

  const showProjects = useCallback((focusHeading = false) => {
    setView("projects");
    setIntent("projects");
    window.history.replaceState(null, "", "/#recent-projects");
    if (focusHeading) {
      window.requestAnimationFrame(() => projectsTitleRef.current?.focus());
    }
  }, []);

  const showIntro = useCallback((focusHeading = false) => {
    setView("intro");
    setIntent("idle");
    window.history.replaceState(null, "", "/");
    if (focusHeading) {
      window.requestAnimationFrame(() => homeTitleRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    router.prefetch("/upload");

    const syncViewWithHash = () => {
      if (window.location.hash === "#recent-projects") {
        showProjects();
      } else {
        showIntro();
      }
    };

    syncViewWithHash();
    window.addEventListener("hashchange", syncViewWithHash);

    return () => {
      window.removeEventListener("hashchange", syncViewWithHash);
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
      if (keyboardResetRef.current !== null) {
        window.clearTimeout(keyboardResetRef.current);
      }
    };
  }, [router, showIntro, showProjects]);

  useEffect(() => {
    if (view !== "intro" || reduceMotion) {
      resetStagePointer();
      resetCourseMagnetic();
      resetProjectsMagnetic();
    }
  }, [
    resetCourseMagnetic,
    resetProjectsMagnetic,
    reduceMotion,
    resetStagePointer,
    view,
  ]);

  useEffect(() => {
    if (view !== "projects") {
      return;
    }

    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      stageRef.current?.setAttribute("data-keyboard-transition", "true");
      showIntro(true);
      keyboardResetRef.current = window.setTimeout(() => {
        stageRef.current?.removeAttribute("data-keyboard-transition");
      }, 80);
    };

    window.addEventListener("keydown", closeWithKeyboard);
    return () => window.removeEventListener("keydown", closeWithKeyboard);
  }, [showIntro, view]);

  function handleActionEnter(
    event: PointerEvent<HTMLElement>,
    nextIntent: Exclude<ActionIntent, "idle">,
  ) {
    event.currentTarget.dataset.entry = getEntrySide(event);
    if (
      event.pointerType === "mouse" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      setIntent(nextIntent);
    }
  }

  function handleActionLeave(event: PointerEvent<HTMLElement>) {
    event.currentTarget.dataset.entry = getEntrySide(event);
    setIntent(view === "projects" ? "projects" : "idle");
  }

  function startCourse(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (event.detail === 0) {
      router.push("/upload");
      return;
    }
    if (isLeaving) {
      return;
    }

    setIntent("course");
    setIsLeaving(true);
    navigationTimerRef.current = window.setTimeout(() => {
      router.push("/upload");
    }, 300);
  }

  return (
    <div className="home-stage-shell">
      <section
        ref={stageRef}
        className="home-stage"
        data-view={view}
        data-intent={intent}
        data-leaving={isLeaving ? "true" : "false"}
        aria-labelledby={view === "intro" ? "home-title" : "projects-title"}
        onPointerMove={handleStagePointerMove}
        onPointerLeave={resetStagePointer}
      >
        <motion.div
          className="home-stage__cursor-light"
          aria-hidden="true"
          style={{
            opacity: lightOpacity,
            transform: lightTransform,
          }}
        />
        <div className="home-stage__plane" aria-hidden="true" />

        <div
          className="home-stage__intro"
          aria-hidden={view !== "intro"}
          inert={view !== "intro" ? true : undefined}
        >
          <p className="home-stage__eyebrow">
            面向数学课程的智能制作工具
          </p>
          <h1
            ref={homeTitleRef}
            id="home-title"
            tabIndex={-1}
            className="home-stage__title"
          >
            把数学课件
            <span>讲成一堂课</span>
          </h1>
          <p className="home-stage__summary">
            上传课件，校对讲稿与公式，生成完整授课视频。
          </p>

          <div className="home-stage__actions">
            <Link
              href="/upload"
              className="home-action home-action--primary"
              aria-label="新建课程，上传 PPT 或 PPTX"
              onClick={startCourse}
              onPointerEnter={(event) => handleActionEnter(event, "course")}
              onPointerMove={moveCourseMagnetic}
              onPointerLeave={(event) => {
                resetCourseMagnetic();
                handleActionLeave(event);
              }}
            >
              <span className="home-action__fill" aria-hidden="true" />
              <motion.span
                className="home-action__content"
                style={{ transform: courseMagneticTransform }}
              >
                <span>
                  新建课程
                  <small>导入 PPT 或 PPTX</small>
                </span>
                <ArrowRightIcon aria-hidden="true" />
              </motion.span>
            </Link>

            <button
              type="button"
              className="home-action home-action--secondary"
              aria-controls="recent-projects-panel"
              aria-expanded={view === "projects"}
              onClick={(event) => {
                if (event.detail === 0) {
                  stageRef.current?.setAttribute(
                    "data-keyboard-transition",
                    "true",
                  );
                  keyboardResetRef.current = window.setTimeout(() => {
                    stageRef.current?.removeAttribute(
                      "data-keyboard-transition",
                    );
                  }, 80);
                }
                showProjects(true);
              }}
              onPointerEnter={(event) => handleActionEnter(event, "projects")}
              onPointerMove={moveProjectsMagnetic}
              onPointerLeave={(event) => {
                resetProjectsMagnetic();
                handleActionLeave(event);
              }}
            >
              <span className="home-action__fill" aria-hidden="true" />
              <motion.span
                className="home-action__content"
                style={{ transform: projectsMagneticTransform }}
              >
                <span>
                  查看最近项目
                  <small>回到上次编辑位置</small>
                </span>
                <FolderOpenIcon aria-hidden="true" />
              </motion.span>
            </button>
          </div>
        </div>

        <div
          className="home-stage__projects-heading"
          aria-hidden={view !== "projects"}
          inert={view !== "projects" ? true : undefined}
        >
          <button
            type="button"
            className="home-stage__back"
            onClick={(event) => {
              if (event.detail === 0) {
                stageRef.current?.setAttribute(
                  "data-keyboard-transition",
                  "true",
                );
                keyboardResetRef.current = window.setTimeout(() => {
                  stageRef.current?.removeAttribute(
                    "data-keyboard-transition",
                  );
                }, 80);
              }
              showIntro(true);
            }}
          >
            <ArrowLeftIcon aria-hidden="true" />
            返回课程入口
          </button>
          <h2
            ref={projectsTitleRef}
            id="projects-title"
            tabIndex={-1}
          >
            最近项目
          </h2>
          <p>继续编辑讲稿，调整授课配置，或查看已经生成的课程视频。</p>
        </div>

        <div className="home-stage__visual" aria-hidden="true">
          <motion.div
            className="home-stage__visual-motion"
            style={{ transform: visualTransform }}
          >
            <Image
              src="/images/math-course-editorial.webp"
              alt=""
              fill
              priority
              sizes="(min-width: 900px) 46vw, 82vw"
              className="home-stage__image"
            />
            <div className="home-stage__image-shade" />
            <div className="home-stage__visual-caption">
              <span data-caption="idle">函数、极限与几何</span>
              <span data-caption="course">
                <FileUpIcon aria-hidden="true" />
                从课件开始
              </span>
              <span data-caption="projects">
                <FolderOpenIcon aria-hidden="true" />
                接着上次继续
              </span>
            </div>
          </motion.div>
        </div>

        <div className="home-stage__workflow" aria-label="课程制作流程">
          <span>导入课件</span>
          <span>校对讲稿</span>
          <span>生成成片</span>
        </div>

        <div
          id="recent-projects-panel"
          className="home-stage__projects-panel"
          aria-hidden={view !== "projects"}
          inert={view !== "projects" ? true : undefined}
        >
          {recentProjects}
        </div>

        <div className="home-stage__route-wipe" aria-hidden="true" />
      </section>
    </div>
  );
}
