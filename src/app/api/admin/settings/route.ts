import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { success, badRequest } from "@/lib/admin-response";
import { getAllSettings, getSetting, setSetting, deleteSetting, initDefaultSettings } from "@/lib/settings";
import { validateBody } from "@/lib/api-validate";
import { adminSettingDeleteSchema, adminSettingPutSchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";

export const dynamic = "force-dynamic";

// 首次访问时自动从环境变量迁移
let _migrated = false;

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  if (!_migrated) {
    await initDefaultSettings();
    _migrated = true;
  }

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (key) {
    const val = await getSetting(key);
    return success({ key, exists: !!val });
  }

  const all = await getAllSettings();
  return success(all);
}

export async function PUT(req: NextRequest) {
  try {
    const { error } = await requireAdmin(req);
    if (error) return error;

    const body = await req.json().catch(() => null);
    const { data, errorResponse: ve } = await validateBody(adminSettingPutSchema, body);
    if (ve) return ve;
    const { key, value } = data;

    await setSetting(key, value);
    return success(undefined, `已保存 ${key}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? getErrorMessage(err) : String(err);
    console.error("[admin/settings] PUT error:", message);
    return NextResponse.json({ success: false, error: `保存失败: ${message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const { data, errorResponse: ve } = await validateBody(adminSettingDeleteSchema, body);
  if (ve) return ve;
  const { key } = data;

  await deleteSetting(key);
  return success(undefined, `已删除 ${key}`);
}
