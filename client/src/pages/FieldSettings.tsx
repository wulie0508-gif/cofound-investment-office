import Navbar from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import type { CustomFieldType } from "@shared/bp";
import {
  PROJECT_FIELD_GROUPS,
  PROJECT_FIELD_METADATA,
} from "@shared/field-metadata";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const typeLabels: Record<CustomFieldType, string> = {
  text: "文本",
  number: "数字",
  date: "日期",
  boolean: "是 / 否",
  select: "单选项",
};

const systemFieldGroups = Object.entries(PROJECT_FIELD_GROUPS).map(
  ([key, label]) => ({
    key,
    label,
    fields: Object.values(PROJECT_FIELD_METADATA).filter(
      field => field.group === key
    ),
  })
);

export default function FieldSettings() {
  const query = trpc.customFields.list.useQuery();
  const create = trpc.customFields.create.useMutation();
  const update = trpc.customFields.update.useMutation();
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [showInList, setShowInList] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingOptions, setEditingOptions] = useState("");

  const refresh = () => query.refetch();
  const addField = async (event: React.FormEvent) => {
    event.preventDefault();
    const options = optionsText
      .split(/[，,\n]/)
      .map(item => item.trim())
      .filter(Boolean);
    if (!label.trim()) return toast.error("请填写字段名称");
    if (fieldType === "select" && options.length < 2)
      return toast.error("单选字段至少需要两个选项");
    try {
      await create.mutateAsync({
        label: label.trim(),
        fieldType,
        options: fieldType === "select" ? options : undefined,
        showInList,
      });
      setLabel("");
      setOptionsText("");
      await refresh();
      toast.success("字段已添加，可以在项目详情中填写");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加失败");
    }
  };

  const patchField = async (
    key: string,
    changes: {
      label?: string;
      options?: string[];
      showInList?: boolean;
      active?: boolean;
      sortOrder?: number;
    }
  ) => {
    try {
      await update.mutateAsync({ key, ...changes });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const fields = query.data ?? [];
    const target = fields[index + direction];
    const current = fields[index];
    if (!target || !current) return;
    try {
      await update.mutateAsync({
        key: current.key,
        sortOrder: target.sortOrder,
      });
      await update.mutateAsync({
        key: target.key,
        sortOrder: current.sortOrder,
      });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "排序失败");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main className="app-page max-w-[1240px]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回工作台
        </Link>
        <header className="mt-5 border-b border-foreground pb-7">
          <p className="finance-kicker">FIELD CONFIGURATION</p>
          <h1 className="page-heading mt-3">项目字段设置</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            核心融资与商业字段保持统一口径；这里添加的是团队自己的管理字段，可决定是否显示在项目清单中。
          </p>
        </header>

        <details className="section-shell mt-5" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <span className="flex items-center gap-3">
              <LockKeyhole className="size-4 text-signal" />
              <span>
                <span className="block text-sm font-bold">系统分析字段</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  由 BP 分析自动生成，统一全公司的融资与商业口径
                </span>
              </span>
            </span>
            <Badge variant="outline">
              {Object.keys(PROJECT_FIELD_METADATA).length} 项
            </Badge>
          </summary>
          <div className="grid gap-px border-t border-border bg-border lg:grid-cols-5">
            {systemFieldGroups.map(group => (
              <section key={group.key} className="bg-card p-4">
                <h3 className="text-[12px] font-bold">{group.label}</h3>
                <p className="mono-meta mt-1">{group.fields.length} FIELDS</p>
                <ul className="mt-3 space-y-2.5">
                  {group.fields.map(field => (
                    <li key={field.key}>
                      <p className="text-[12px] font-semibold">{field.label}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {field.englishLabel}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>

        <div className="mt-5 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <form
            onSubmit={addField}
            className="section-shell h-fit space-y-4 p-5"
          >
            <div className="flex items-center gap-2">
              <Plus className="size-4 text-signal" aria-hidden="true" />
              <h2 className="font-bold">新增字段</h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-field-label">字段名称</Label>
              <Input
                id="custom-field-label"
                value={label}
                onChange={event => setLabel(event.target.value)}
                placeholder="例如：内部优先级"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-field-type">字段类型</Label>
              <select
                id="custom-field-type"
                value={fieldType}
                onChange={event =>
                  setFieldType(event.target.value as CustomFieldType)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.entries(typeLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
            {fieldType === "select" && (
              <div className="space-y-2">
                <Label htmlFor="custom-field-options">选项</Label>
                <Input
                  id="custom-field-options"
                  value={optionsText}
                  onChange={event => setOptionsText(event.target.value)}
                  placeholder="高，中，低"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
              <Label htmlFor="custom-field-list" className="cursor-pointer">
                显示在项目清单
              </Label>
              <Switch
                id="custom-field-list"
                checked={showInList}
                onCheckedChange={setShowInList}
              />
            </div>
            <Button
              type="submit"
              disabled={create.isPending}
              className="w-full"
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              添加字段
            </Button>
          </form>

          <section
            className="section-shell"
            aria-labelledby="configured-fields-title"
          >
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <SlidersHorizontal className="size-4 text-signal" />
              <h2 id="configured-fields-title" className="font-bold">
                管理字段
              </h2>
            </div>
            {query.isLoading ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                正在读取…
              </p>
            ) : query.data?.length ? (
              <ul className="divide-y divide-border">
                {query.data.map((field, index) => (
                  <li
                    key={field.key}
                    className={`grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${field.active ? "" : "opacity-55"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold">
                          {field.label}
                        </p>
                        <Badge variant="outline" className="text-[10px]">
                          {field.key.startsWith("default_")
                            ? "系统预置"
                            : "团队新增"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {typeLabels[field.fieldType]}
                        {field.options.length
                          ? ` | ${field.options.join(" / ")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingKey(field.key);
                          setEditingLabel(field.label);
                          setEditingOptions(field.options.join("，"));
                        }}
                      >
                        <Pencil className="size-4" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || update.isPending}
                        aria-label={`上移 ${field.label}`}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => move(index, 1)}
                        disabled={
                          index === query.data.length - 1 || update.isPending
                        }
                        aria-label={`下移 ${field.label}`}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          patchField(field.key, {
                            showInList: !field.showInList,
                          })
                        }
                        disabled={!field.active || update.isPending}
                      >
                        {field.showInList ? (
                          <Eye className="size-4" />
                        ) : (
                          <EyeOff className="size-4" />
                        )}
                        {field.showInList ? "清单显示" : "清单隐藏"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          patchField(field.key, { active: !field.active })
                        }
                        disabled={update.isPending}
                      >
                        {field.active ? "停用" : "启用"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                还没有自定义字段。左侧添加后即可在每个项目中填写。
              </p>
            )}
          </section>
        </div>
      </main>
      <Dialog
        open={Boolean(editingKey)}
        onOpenChange={open => {
          if (!open) setEditingKey(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑管理字段</DialogTitle>
            <DialogDescription>
              修改显示名称或单选项不会改变字段的底层标识，已有项目数据仍会保留。
            </DialogDescription>
          </DialogHeader>
          {editingKey ? (
            <form
              className="space-y-4"
              onSubmit={async event => {
                event.preventDefault();
                const current = query.data?.find(
                  field => field.key === editingKey
                );
                if (!current) return;
                const nextOptions = editingOptions
                  .split(/[，,\n]/u)
                  .map(item => item.trim())
                  .filter(Boolean);
                if (!editingLabel.trim())
                  return toast.error("字段名称不能为空");
                if (current.fieldType === "select" && nextOptions.length < 2)
                  return toast.error("单选字段至少需要两个选项");
                await patchField(editingKey, {
                  label: editingLabel.trim(),
                  options:
                    current.fieldType === "select" ? nextOptions : undefined,
                });
                setEditingKey(null);
                toast.success("字段设置已更新");
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="editing-field-label">字段名称</Label>
                <Input
                  id="editing-field-label"
                  value={editingLabel}
                  onChange={event => setEditingLabel(event.target.value)}
                  required
                />
              </div>
              {query.data?.find(field => field.key === editingKey)
                ?.fieldType === "select" ? (
                <div className="space-y-2">
                  <Label htmlFor="editing-field-options">单选项</Label>
                  <Input
                    id="editing-field-options"
                    value={editingOptions}
                    onChange={event => setEditingOptions(event.target.value)}
                  />
                </div>
              ) : null}
              <Button className="w-full" disabled={update.isPending}>
                {update.isPending ? "正在保存…" : "保存修改"}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
