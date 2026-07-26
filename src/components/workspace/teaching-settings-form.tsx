"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { PauseIcon, PlayIcon, Volume2Icon } from "lucide-react";
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
});

export type SettingsFormValues = z.infer<typeof settingsSchema>;

const speechRateFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface TeachingSettingsFormProps {
  projectId: string;
  settings: TeachingSettings;
  avatars: Avatar[];
  voices: Voice[];
  onSaveStateChange: (state: WorkspaceSaveState) => void;
  onValidityChange: (isValid: boolean) => void;
}

export function TeachingSettingsForm({
  projectId,
  settings,
  avatars,
  voices,
  onSaveStateChange,
  onValidityChange,
}: TeachingSettingsFormProps) {
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(JSON.stringify(settings));
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

  const saveMutation = useMutation({
    mutationFn: (nextSettings: TeachingSettings) =>
      updateTeachingSettings(projectId, nextSettings),
    onMutate: () => onSaveStateChange("saving"),
    onSuccess: (savedSettings) => {
      lastSavedRef.current = JSON.stringify(savedSettings);
      failedValuesRef.current = null;
      form.reset(savedSettings);
      onSaveStateChange("saved");
    },
    onError: (_error, attemptedSettings) => {
      failedValuesRef.current = JSON.stringify(attemptedSettings);
      onSaveStateChange("error");
    },
  });

  const previewMutation = useMutation({
    mutationFn: (voiceId: string) => getVoicePreview(voiceId),
    onSuccess: ({ voiceId, durationMs }) => {
      setPreviewVoiceId(voiceId);
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
      }
      previewTimerRef.current = setTimeout(
        () => setPreviewVoiceId(null),
        durationMs,
      );
    },
  });

  useEffect(() => {
    const parsed = settingsSchema.safeParse(values);
    onValidityChange(parsed.success);
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
    onValidityChange,
    saveMutation,
    values,
    valuesKey,
  ]);

  useEffect(
    () => () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
      }
    },
    [],
  );

  function stopPreview() {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
    }
    setPreviewVoiceId(null);
  }

  return (
    <aside className="min-w-0 rounded-2xl border bg-card p-4">
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
                    <SelectValue placeholder="选择数字人教师" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {avatars.map((avatar) => (
                        <SelectItem key={avatar.id} value={avatar.id}>
                          <span>{avatar.name}</span>
                          <span className="text-muted-foreground">
                            {avatar.description}
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
                        : previewMutation.mutate(field.value)
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
                <FieldDescription>建议数学推导使用 0.90×–1.10×。</FieldDescription>
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

          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Volume2Icon aria-hidden="true" className="size-4" />
            当前配置将应用到整门课程
          </div>
          {saveMutation.isError ? (
            <div
              className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3"
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
