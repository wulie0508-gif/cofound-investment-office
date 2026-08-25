import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquareText } from "lucide-react";
import { FormEvent, useState } from "react";

type DemoComment = {
  id: number;
  author: string;
  body: string;
  target: string;
  time: string;
};

const INITIAL_COMMENTS: DemoComment[] = [
  {
    id: 1,
    author: "Cassian",
    body: "订单金额对应已签合同还是预测管线？希望下一次沟通时补充回款节奏。",
    target: "字段｜订单金额",
    time: "15:42",
  },
  {
    id: 2,
    author: "Maya",
    body: "第 7 页的交付周期值得再拆一下，尤其是硬件部署与软件验收的时间差。",
    target: "原件｜第 7 页",
    time: "15:48",
  },
];

export function ShareDemoAnnotations() {
  const [comments, setComments] = useState(INITIAL_COMMENTS);
  const [nickname, setNickname] = useState("Cassian");
  const [body, setBody] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nickname.trim() || !body.trim()) return;
    setComments(current => [
      ...current,
      {
        id: Date.now(),
        author: nickname.trim(),
        body: body.trim(),
        target: "整个项目",
        time: new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date()),
      },
    ]);
    setBody("");
  }

  return (
    <section
      className="border border-border bg-card"
      aria-labelledby="demo-comments-title"
    >
      <div className="border-b border-foreground px-4 py-4">
        <h2
          id="demo-comments-title"
          className="flex items-center gap-2 text-base font-bold"
        >
          <MessageSquareText
            className="size-4 text-signal"
            aria-hidden="true"
          />
          协作批注
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Comments · 使用昵称参与，不要求提交邮箱。
        </p>
      </div>

      <div className="divide-y divide-border">
        {comments.map(comment => (
          <article key={comment.id} className="px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">{comment.author}</p>
              <time className="font-mono text-[10px] text-muted-foreground">
                {comment.time}
              </time>
            </div>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              {comment.target}
            </p>
            <p className="mt-2 text-sm leading-6">{comment.body}</p>
          </article>
        ))}
      </div>

      <form className="border-t border-border p-4" onSubmit={submit}>
        <label htmlFor="demo-comment-name" className="text-xs font-semibold">
          昵称
        </label>
        <Input
          id="demo-comment-name"
          value={nickname}
          onChange={event => setNickname(event.target.value)}
          className="mt-2"
          maxLength={40}
        />
        <label
          htmlFor="demo-comment-body"
          className="mt-4 block text-xs font-semibold"
        >
          新增批注
        </label>
        <textarea
          id="demo-comment-body"
          value={body}
          onChange={event => setBody(event.target.value)}
          className="mt-2 min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="写下问题、判断或需要补充的材料…"
          maxLength={1000}
        />
        <Button
          type="submit"
          className="mt-3 w-full"
          disabled={!nickname.trim() || !body.trim()}
        >
          提交演示批注
        </Button>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          本页批注只保存在当前浏览器内存中，刷新后恢复演示数据。
        </p>
      </form>
    </section>
  );
}
