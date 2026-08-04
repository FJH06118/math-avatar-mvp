"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PauseIcon, PlayIcon, Volume2Icon } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { getVoicePreview, updateTeachingSettings } from "@/lib/api";
import { getEnabledTracerApiAdapter } from "@/lib/api/tracer-adapter";
import type {
  Avatar,
  TeachingSettings,
  Voice,
} from "@/types";

import { TeachingVisualSettings } from "./teaching-visual-settings";
import type { WorkspaceSaveState } from "./workspace-header";

const settingsSchema = z.object({
  avatarId: z.string().min(1, "请选择数字人教师。"),
  voiceId: z.string().min(1, "请选择授课音色。"),
  speechRate: z.number().min(0.75).max(1.5),
  captionsEnabled: z.boolean(),
  captionStyle: z.enum(["clear", "focus", "minimal"]),
  avatarPosition: z.enum(["left", "right"]),
  background: z.enum(["classroom", "light", "board"]),
  slideOverrides: z
    .array(
      z.object({
        slideId: z.string().min(1),
        avatarPosition: z.enum(["left", "right", "hidden"]),
      }),
    )
    .optional(),
});

export type SettingsFormValues = z.infer<typeof settingsSchema>;

const speechRateFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface TeachingSettingsFormProps {
  projectId: string;
  presentationId: string;
  settings: TeachingSettings;
  avatars: Avatar[];
  voices: Voice[];
  onSaveStateChange: (state: WorkspaceSaveState) => void;
  onValidityChange: (isValid: boolean) => void;
  onPreviewSettingsChange?: (settings: TeachingSettings) => void;
  selectedSlideId: string;
  selectedSlideTitle: string;
}

export function TeachingSettingsForm({
  projectId,
  presentationId,
  settings,
  avatars,
  voices,
  onSaveStateChange,
  onValidityChange,
  onPreviewSettingsChange,
  selectedSlideId,
  selectedSlideTitle,
}: TeachingSettingsFormProps) {
  const queryClient = useQueryClient();
  const realAdapter = getEnabledTracerApiAdapter();
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [mockPreviewUrl, setMockPreviewUrl] = useState<string | null>(null);
  const [mockPlaybackRate, setMockPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedRef = useRef(JSON.stringify(settings));
  const lastPreviewedRef = useRef<string | null>(null);
  const failedValuesRef = useRef<string | null>(null);

  const avatarItems = useMemo(
    () => avatars.map((avatar) => ({ value: avatar.id, label: avatar.name })),
    [avatars],
  );
  const voiceItems = useMemo(
    () => voices.map((voice) => ({ value: voice.id, label: voice.name })),
    [voices],
  );

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
    mode: "onChange",
  });
  const values = useWatch({ control: form.control });
  const valuesKey = JSON.stringify(values);
  const currentVoice = voices.find((voice) => voice.id === values.voiceId);
  const currentAvatar = avatars.find((avatar) => avatar.id === values.avatarId);
  const currentSlideOverride = values.slideOverrides?.find(
    (override) => override?.slideId === selectedSlideId,
  )?.avatarPosition;

  const saveMutation = useMutation({
    mutationFn: (nextSettings: TeachingSettings) =>
      updateTeachingSettings(projectId, nextSettings),
    onMutate: () => onSaveStateChange("saving"),
    onSuccess: (savedSettings, attemptedSettings) => {
      const attemptedKey = JSON.stringify(attemptedSettings);
      const currentKey = JSON.stringify(form.getValues());
      lastSavedRef.current = JSON.stringify(savedSettings);
      failedValuesRef.current = null;
      queryClient.setQueryData(
        ["workspace", projectId],
        (current: unknown) => {
          if (
            !current ||
            typeof current !== "object" ||
            !("project" in current)
          ) {
            return current;
          }
          const workspace = current as {
            project: { settings: TeachingSettings };
          };
          return {
            ...workspace,
            project: {
              ...workspace.project,
              settings: savedSettings,
            },
          };
        },
      );
      if (currentKey === attemptedKey) {
        form.reset(savedSettings);
        onSaveStateChange("saved");
      } else {
        onSaveStateChange("unsaved");
      }
    },
    onError: (_error, attemptedSettings) => {
      failedValuesRef.current = JSON.stringify(attemptedSettings);
      onSaveStateChange("error");
    },
  });

  const previewMutation = useMutation({
    mutationFn: async ({ voiceId, speechRate }: { voiceId: string; speechRate: number }) => {
      if (!realAdapter) {
        const preview = await getVoicePreview(voiceId, speechRate);
        return { mode: "mock" as const, ...preview };
      }
      const task = await realAdapter.createVoicePreviewTask(projectId, {
        presentationId,
        idempotencyKey: `preview_${crypto.randomUUID()}`,
        voice: edgeVoiceFor(voiceId),
        rate: edgeRateFor(speechRate),
        pitch: edgePitchFor(voiceId),
      });
      return { mode: "real" as const, voiceId, taskId: task.id };
    },
    onSuccess: (preview) => {
      setPreviewVoiceId(preview.voiceId);
      if (preview.mode === "real") {
        setPreviewTaskId(preview.taskId);
        return;
      }
      setMockPreviewUrl(preview.previewUrl);
      setMockPlaybackRate(preview.playbackRate);
    },
  });

  const previewTaskQuery = useQuery({
    queryKey: ["voice-preview-task", previewTaskId],
    queryFn: ({ signal }) => realAdapter!.getTask(previewTaskId!, signal),
    enabled: Boolean(realAdapter && previewTaskId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ["SUCCEEDED", "FAILED", "CANCELLED"].includes(status) ? false : 700;
    },
  });
  const previewTimelineQuery = useQuery({
    queryKey: ["voice-preview-timeline", previewTaskId],
    queryFn: ({ signal }) => realAdapter!.getAudioTimeline(previewTaskId!, signal),
    enabled: Boolean(realAdapter && previewTaskId && previewTaskQuery.data?.status === "SUCCEEDED"),
  });
  const previewUrl = mockPreviewUrl ?? previewTimelineQuery.data?.segments[0]?.previewUrl;

  useEffect(() => {
    const parsed = settingsSchema.safeParse(values);
    onValidityChange(parsed.success);
    if (parsed.success && valuesKey !== lastPreviewedRef.current) {
      lastPreviewedRef.current = valuesKey;
      onPreviewSettingsChange?.(parsed.data);
    }
    if (
      !parsed.success ||
      valuesKey === lastSavedRef.current ||
      valuesKey === failedValuesRef.current ||
      saveMutation.isPending
    ) {
      return;
    }

    onSaveStateChange("unsaved");
    const timeoutId = setTimeout(() => {
      saveMutation.mutate(parsed.data);
    }, 700);
    return () => clearTimeout(timeoutId);
  }, [
    onSaveStateChange,
    onPreviewSettingsChange,
    onValidityChange,
    saveMutation,
    values,
    valuesKey,
  ]);

  function stopPreview() {
    audioRef.current?.pause();
    setPreviewTaskId(null);
    setMockPreviewUrl(null);
    setMockPlaybackRate(1);
    setPreviewVoiceId(null);
  }

  return (
    <aside className="min-w-0 border-t border-foreground/15 bg-card p-4 sm:p-5 lg:col-span-2 xl:col-span-1 xl:border-t-0">
      <form
        aria-label="授课配置"
        autoComplete="off"
        onSubmit={(event) => event.preventDefault()}
      >
        <FieldGroup>
          <div>
            <h2 className="text-base font-semibold">授课配置</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              设置数字人、音色和画面样式，修改后自动保存。
            </p>
          </div>

          <Controller
            name="avatarId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="avatar-select">数字人教师</FieldLabel>
                <Select
                  items={avatarItems}
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger
                    id="avatar-select"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "avatar-select-error" : undefined
                    }
                  >
                    {currentAvatar?.imageUrl ? (
                      <Image
                        src={currentAvatar.imageUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="size-6 shrink-0 rounded-full bg-secondary object-cover object-top outline-1 -outline-offset-1 outline-foreground/10"
                      />
                    ) : null}
                    <SelectValue placeholder="选择数字人教师" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {avatars.map((avatar) => (
                        <SelectItem key={avatar.id} value={avatar.id}>
                          {avatar.imageUrl ? (
                            <Image
                              src={avatar.imageUrl}
                              alt=""
                              width={44}
                              height={44}
                              className="size-11 shrink-0 rounded-full bg-secondary object-cover object-top outline-1 -outline-offset-1 outline-foreground/10"
                            />
                          ) : null}
                          <span className="flex min-w-0 flex-col items-start">
                            <span className="font-medium">{avatar.name}</span>
                            <span className="max-w-52 truncate text-muted-foreground">
                              {avatar.description}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError
                  id="avatar-select-error"
                  errors={[fieldState.error]}
                />
              </Field>
            )}
          />

          <Controller
            name="voiceId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="voice-select">授课音色</FieldLabel>
                <Select
                  items={voiceItems}
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger
                    id="voice-select"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "voice-select-error" : undefined
                    }
                  >
                    <SelectValue placeholder="选择授课音色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {voices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          <span>{voice.name}</span>
                          <span className="text-muted-foreground">
                            {voice.description}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-between gap-3">
                  <FieldDescription>
                    {currentVoice?.description ?? "试听后再确定音色。"}
                  </FieldDescription>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!field.value || previewMutation.isPending}
                    onClick={() =>
                      previewVoiceId === field.value
                        ? stopPreview()
                        : previewMutation.mutate({
                            voiceId: field.value,
                            speechRate: form.getValues("speechRate"),
                          })
                    }
                  >
                    {previewMutation.isPending ? (
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                    ) : previewVoiceId === field.value ? (
                      <PauseIcon data-icon="inline-start" aria-hidden="true" />
                    ) : (
                      <PlayIcon data-icon="inline-start" aria-hidden="true" />
                    )}
                    {previewVoiceId === field.value ? "停止" : "试听"}
                  </Button>
                </div>
                {previewMutation.isError ? (
                  <FieldError>试听失败，请稍后重试。</FieldError>
                ) : null}
                {previewTaskQuery.data?.status === "FAILED" || previewTimelineQuery.isError ? (
                  <FieldError>试听生成失败，请稍后重试。</FieldError>
                ) : null}
                {previewUrl ? (
                  <audio
                    ref={audioRef}
                    className="w-full"
                    controls
                    autoPlay
                    src={previewUrl}
                    onLoadedMetadata={(event) => {
                      if (mockPreviewUrl) {
                        event.currentTarget.playbackRate = mockPlaybackRate;
                      }
                    }}
                    onEnded={() => setPreviewVoiceId(null)}
                  >
                    当前浏览器不支持音频播放。
                  </audio>
                ) : null}
                <FieldError
                  id="voice-select-error"
                  errors={[fieldState.error]}
                />
              </Field>
            )}
          />

          <Controller
            name="speechRate"
            control={form.control}
            render={({ field }) => (
              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="speech-rate">授课语速</FieldLabel>
                  <output
                    htmlFor="speech-rate"
                    className="text-sm font-medium tabular-nums"
                  >
                    {speechRateFormatter.format(field.value)}×
                  </output>
                </div>
                <Slider
                  id="speech-rate"
                  name={field.name}
                  value={field.value}
                  min={0.75}
                  max={1.5}
                  step={0.05}
                  aria-label="授课语速"
                  onValueChange={field.onChange}
                />
                <FieldDescription>
                  建议数学推导使用 0.90× 至 1.10×。
                </FieldDescription>
                <FieldDescription>
                  试听内容：“生活就像海洋，只有意志坚强的人才能到达彼岸。”
                </FieldDescription>
              </Field>
            )}
          />

          <Controller
            name="captionsEnabled"
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="captions-enabled">显示字幕</FieldLabel>
                  <FieldDescription>
                    为视频生成可下载的中文字幕。
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="captions-enabled"
                  name={field.name}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />

          <TeachingVisualSettings
            control={form.control}
            captionsEnabled={values.captionsEnabled ?? true}
          />

          <Field>
            <FieldLabel htmlFor="slide-avatar-position">本页数字人站位</FieldLabel>
            <Select
              items={[
                { value: "inherit", label: "沿用全局站位" },
                { value: "left", label: "左侧" },
                { value: "right", label: "右侧" },
                { value: "hidden", label: "本页隐藏" },
              ]}
              name="slide-avatar-position"
              value={currentSlideOverride ?? "inherit"}
              onValueChange={(value) => {
                const retained = (form.getValues("slideOverrides") ?? []).filter(
                  (override) => override.slideId !== selectedSlideId,
                );
                form.setValue(
                  "slideOverrides",
                  value && value !== "inherit"
                    ? [
                        ...retained,
                        {
                          slideId: selectedSlideId,
                          avatarPosition: value as "left" | "right" | "hidden",
                        },
                      ]
                    : retained,
                  { shouldDirty: true, shouldValidate: true },
                );
              }}
            >
              <SelectTrigger id="slide-avatar-position" className="w-full">
                <SelectValue placeholder="选择本页站位" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="inherit">沿用全局站位</SelectItem>
                  <SelectItem value="left">左侧</SelectItem>
                  <SelectItem value="right">右侧</SelectItem>
                  <SelectItem value="hidden">本页隐藏</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              当前页“{selectedSlideTitle}”可覆盖全局站位；内容拥挤时允许隐藏数字人。
            </FieldDescription>
          </Field>

          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Volume2Icon aria-hidden="true" className="size-4" />
            当前配置将应用到整门课程
          </div>
          {saveMutation.isError ? (
            <div
              className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              role="alert"
            >
              <p className="text-sm text-destructive">
                授课配置未保存，当前更改仍保留在页面中。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={saveMutation.isPending}
                onClick={() => {
                  const parsed = settingsSchema.safeParse(values);
                  if (parsed.success) {
                    saveMutation.mutate(parsed.data);
                  }
                }}
              >
                重新保存配置
              </Button>
            </div>
          ) : null}
        </FieldGroup>
      </form>
    </aside>
  );
}

function edgeVoiceFor(voiceId: string): string {
  return {
    "voice-qinghe": "zh-CN-XiaoxiaoNeural",
    "voice-zhiyuan": "zh-CN-YunyangNeural",
    "voice-mingxi": "zh-CN-XiaoyiNeural",
  }[voiceId] ?? "zh-CN-XiaoxiaoNeural";
}

function edgeRateFor(speechRate: number): string {
  const percentage = Math.round((speechRate - 1) * 100);
  return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

function edgePitchFor(voiceId: string): string {
  return {
    "voice-qinghe": "+0Hz",
    "voice-zhiyuan": "-2Hz",
    "voice-mingxi": "+2Hz",
  }[voiceId] ?? "+0Hz";
}
