"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Controller, type Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type {
  AvatarPosition,
  BackgroundStyle,
  CaptionStyle,
} from "@/types";

import type { SettingsFormValues } from "./teaching-settings-form";

const captionStyleItems: Array<{ value: CaptionStyle; label: string }> = [
  { value: "clear", label: "清晰白底" },
  { value: "focus", label: "重点强调" },
  { value: "minimal", label: "简洁无底" },
];

const backgroundItems: Array<{ value: BackgroundStyle; label: string }> = [
  { value: "light", label: "明亮教室" },
  { value: "classroom", label: "现代课堂" },
  { value: "board", label: "黑板推导" },
];

interface TeachingVisualSettingsProps {
  control: Control<SettingsFormValues>;
  captionsEnabled: boolean;
}

export function TeachingVisualSettings({
  control,
  captionsEnabled,
}: TeachingVisualSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between"
          />
        }
      >
        更多画面设置
        <ChevronDownIcon
          data-icon="inline-end"
          aria-hidden="true"
          className={
            isOpen
              ? "rotate-180 transition-transform duration-[140ms] ease-[var(--ease-out)] motion-reduce:transform-none"
              : "transition-transform duration-[140ms] ease-[var(--ease-out)] motion-reduce:transform-none"
          }
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-5">
        <FieldGroup>
          <Controller
            name="captionStyle"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="caption-style">字幕样式</FieldLabel>
                <Select
                  items={captionStyleItems}
                  name={field.name}
                  value={field.value}
                  disabled={!captionsEnabled}
                  onValueChange={(value) =>
                    field.onChange(value ?? "clear")
                  }
                >
                  <SelectTrigger id="caption-style" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {captionStyleItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />

          <Controller
            name="avatarPosition"
            control={control}
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">数字人位置</FieldLegend>
                <ToggleGroup
                  value={[field.value]}
                  variant="outline"
                  spacing={2}
                  className="grid w-full grid-cols-2"
                  aria-label="数字人位置"
                  onValueChange={(value) =>
                    field.onChange(
                      (value[0] ?? "right") as AvatarPosition,
                    )
                  }
                >
                  <ToggleGroupItem value="left">画面左侧</ToggleGroupItem>
                  <ToggleGroupItem value="right">画面右侧</ToggleGroupItem>
                </ToggleGroup>
              </FieldSet>
            )}
          />

          <Controller
            name="background"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="background-style">背景样式</FieldLabel>
                <Select
                  items={backgroundItems}
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) =>
                    field.onChange(value ?? "light")
                  }
                >
                  <SelectTrigger id="background-style" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {backgroundItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
