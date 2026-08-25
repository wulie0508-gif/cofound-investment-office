import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import type { ProjectCustomField } from "@shared/bp";
import { ListPlus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

function FieldEditor({
  projectId,
  field,
  onSaved,
}: {
  projectId: string;
  field: ProjectCustomField;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(
    field.value === null ? "" : String(field.value)
  );
  const mutation = trpc.customFields.setValue.useMutation();
  useEffect(() => {
    setValue(field.value === null ? "" : String(field.value));
  }, [field.value]);
  const save = async () => {
    let normalized: string | number | boolean | null = value || null;
    if (field.fieldType === "number")
      normalized = value === "" ? null : Number(value);
    if (field.fieldType === "boolean")
      normalized = value === "" ? null : value === "true";
    try {
      await mutation.mutateAsync({
        projectId,
        fieldKey: field.key,
        value: normalized,
      });
      toast.success(`${field.label}已保存`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };
  const inputId = `custom-field-${field.key}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{field.label}</Label>
      <div className="flex gap-2">
        {field.fieldType === "select" || field.fieldType === "boolean" ? (
          <select
            id={inputId}
            value={value}
            onChange={event => setValue(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">未填写</option>
            {(field.fieldType === "boolean"
              ? ["true", "false"]
              : field.options
            ).map(option => (
              <option key={option} value={option}>
                {field.fieldType === "boolean"
                  ? option === "true"
                    ? "是"
                    : "否"
                  : option}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id={inputId}
            type={
              field.fieldType === "number"
                ? "number"
                : field.fieldType === "date"
                  ? "date"
                  : "text"
            }
            value={value}
            onChange={event => setValue(event.target.value)}
            className="min-w-0 flex-1"
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={save}
          disabled={mutation.isPending}
          aria-label={`保存 ${field.label}`}
        >
          <Save className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function CustomFieldsPanel({
  projectId,
  fields,
  onUpdated,
}: {
  projectId: string;
  fields: ProjectCustomField[];
  onUpdated: () => void;
}) {
  return (
    <section className="section-shell" aria-labelledby="custom-fields-title">
      <div className="section-bar">
        <h2 id="custom-fields-title" className="section-title">
          团队自定义字段
        </h2>
        <Link
          href="/settings/fields"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          管理字段
        </Link>
      </div>
      {fields.length ? (
        <div className="space-y-4 p-5">
          {fields.map(field => (
            <FieldEditor
              key={field.key}
              projectId={projectId}
              field={field}
              onSaved={onUpdated}
            />
          ))}
        </div>
      ) : (
        <div className="m-5 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          <ListPlus className="mb-2 size-4" aria-hidden="true" />
          还没有团队字段。可以添加“内部优先级”“负责人”“下次跟进日”等字段。
        </div>
      )}
    </section>
  );
}
