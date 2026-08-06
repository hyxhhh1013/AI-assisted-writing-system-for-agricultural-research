"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { getProject, listProjects } from "@/services/project";
import { buildPlagiarismContentFromProject } from "@/lib/export-content";
import { usePlagiarismCheck } from "@/hooks/use-plagiarism-check";
import { PlagiarismCheckForm } from "@/components/shared/plagiarism/check-form";
import { PlagiarismResultView } from "@/components/shared/plagiarism/result-view";
import { PlagiarismRewriteView } from "@/components/shared/plagiarism/rewrite-view";

interface PlagiarismPanelProps {
  projectId?: string;
  projectTitle?: string;
  initialContent?: string;
  showProjectSelector?: boolean;
}

export function PlagiarismPanel({
  projectId,
  projectTitle,
  initialContent,
  showProjectSelector = false,
}: PlagiarismPanelProps) {
  const [checkTitle, setCheckTitle] = useState(projectTitle || "");
  const [checkContent, setCheckContent] = useState(initialContent || "");
  const [webSearch, setWebSearch] = useState(false);
  const [view, setView] = useState<"check" | "result" | "rewrite">("check");

  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [loadingProject, setLoadingProject] = useState(false);

  const { result, checking, stage, error, check, cancel, reset } = usePlagiarismCheck();
  const lastToastCheckIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (showProjectSelector) {
      listProjects().then((d) => { if (Array.isArray(d)) setProjects(d); }).catch(() => {});
    }
  }, [showProjectSelector]);

  useEffect(() => { if (initialContent) setCheckContent(initialContent); }, [initialContent]);
  useEffect(() => { if (projectTitle) setCheckTitle(projectTitle); }, [projectTitle]);

  useEffect(() => {
    if (checking || !result?.checkId) return;
    if (lastToastCheckIdRef.current === result.checkId) return;

    lastToastCheckIdRef.current = result.checkId;
    setView("result");
    toast.success(`检测完成，${result.totalMatches} 处匹配`);
  }, [result, checking]);

  const loadProject = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoadingProject(true);
    try {
      const p = await getProject(pid);
      if (!p) throw new Error("加载失败");
      setSelectedProjectId(pid);
      setCheckTitle(p.title || "");
      setCheckContent(buildPlagiarismContentFromProject(p));
      lastToastCheckIdRef.current = null;
      reset();
      setView("check");
      toast.success(`已导入「${p.title}」`);
    } catch {
      toast.error("加载失败");
    } finally {
      setLoadingProject(false);
    }
  }, [reset]);

  const handleCheck = useCallback(async () => {
    if (!checkContent.trim()) { toast.error("请输入要检测的内容"); return; }
    if (checkContent.length > 100_000) { toast.error("内容超过 10 万字上限"); return; }
    await check({
      projectId: selectedProjectId || projectId,
      title: checkTitle || "未命名",
      content: checkContent,
      webSearch,
    });
  }, [check, checkContent, checkTitle, projectId, selectedProjectId, webSearch]);

  if (view === "check") {
    return (
      <PlagiarismCheckForm
        title={checkTitle}
        setTitle={setCheckTitle}
        content={checkContent}
        setContent={setCheckContent}
        webSearch={webSearch}
        setWebSearch={setWebSearch}
        checking={checking}
        stage={stage}
        error={error}
        onCheck={handleCheck}
        onCancel={cancel}
        onClear={() => {
          setCheckContent("");
          lastToastCheckIdRef.current = null;
          reset();
          setSelectedProjectId("");
        }}
        plist={showProjectSelector && !initialContent ? projects : undefined}
        selPid={selectedProjectId}
        loadingP={loadingProject}
        onLoadProject={showProjectSelector && !initialContent ? loadProject : undefined}
        compact
      />
    );
  }

  if (!result) return null;

  if (view === "result") {
    return (
      <PlagiarismResultView
        result={result}
        compact
        onRewrite={() => setView("rewrite")}
        onReCheck={() => {
          lastToastCheckIdRef.current = null;
          reset();
          setView("check");
        }}
      />
    );
  }

  return (
    <PlagiarismRewriteView
      checkId={result.checkId}
      matches={result.matches}
      fullContent={checkContent}
      compact
      onBack={() => setView("result")}
      onApplied={(newContent) => {
        setCheckContent(newContent);
        reset();
        lastToastCheckIdRef.current = null;
        setView("check");
        toast.success("已应用改写，点击「查重」验证");
      }}
    />
  );
}
