const labels = {
  admin: "管理员",
  internal: "内部成员",
  external: "外部协作者",
  invited: "待激活",
  active: "有效",
  suspended: "已停用",
  draft: "草稿",
  published: "已发布",
  paused: "已暂停",
  expired: "已过期",
  pending: "处理中",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  conflict: "版本冲突",
  synced: "已同步",
  error: "同步异常",
  trusted: "可信查看",
  high_security: "高保密查看",
  fields_only: "仅字段与分析",
  selected_files: "字段与指定文件",
  approved: "已批准",
  rejected: "已拒绝",
  downloaded: "已下载",
  publish: "发布项目",
  sync: "同步项目",
  verify: "核验字段",
  watermarked_download: "生成水印副本",
} as const;

const actionLabels: Record<string, string> = {
  "session.local_admin_started": "本机管理员已登录",
  "session.email_otp_verified": "邮箱身份验证成功",
  "session.login": "账号已登录",
  "session.logout": "账号已退出",
  "profile.name_updated": "更新了姓名或昵称",
  "profile.language_updated": "更新了界面语言",
  "profile.updated": "更新了个人账户设置",
  "invitation.created": "创建了协作邀请",
  "invitation.accepted": "接受了协作邀请",
  "invitation.revoked": "撤销了协作邀请",
  "publication.configured": "调整了项目共享范围",
  "publication.verified": "完成了共享字段核验",
  "publication.synced": "完成了共享项目同步",
  "publication.vercel_synced": "同步至线上资料室",
  "publication.paused": "暂停了项目共享",
  "portal.project_viewed": "查看了共享项目",
  "portal.file_viewed": "查看了共享文件",
  "download.requested": "提交了下载申请",
  "download.approved": "批准了下载申请",
  "download.rejected": "拒绝了下载申请",
  "download.completed": "完成了文件下载",
};

const targetLabels: Record<string, string> = {
  session: "账号会话",
  user: "协作成员",
  invitation: "成员邀请",
  publication: "共享项目",
  file: "项目文件",
  download_request: "下载申请",
};

export function collaborationLabel(value: string) {
  return labels[value as keyof typeof labels] ?? value;
}

export function auditActionLabel(value: string) {
  return actionLabels[value] ?? "完成了一项协作操作";
}

export function auditTargetLabel(value: string) {
  return targetLabels[value] ?? "协作记录";
}

export function englishStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, letter => letter.toUpperCase());
}
