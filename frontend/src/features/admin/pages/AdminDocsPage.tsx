import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';

type DocSection = {
  title: string;
  description: string;
  commands?: string[];
  checklist?: string[];
  references?: string[];
};

type StageType = 'dev' | 'prod';

const SPRINT_LOCKS = [
  '1) Today UX 운영형 보강 (period UX + sender 관점 노출 강화)',
  '2) Materializer 운영자동화(실패 세그먼트 재실행 + 알림 연동)',
  '3) Admin Docs Hub(운영 명령/런북/QA를 Admin에서 조회)'
];

const DOC_SECTIONS: DocSection[] = [
  {
    title: 'Materializer Runbook 실행 명령 (Linux/macOS)',
    description: '운영 런북 절차 기준. 반드시 dry-run → 본실행 순서로 진행하세요.',
    commands: [
      './scripts/cheer-stats-backfill.sh --stage dev --dry-run',
      './scripts/cheer-stats-backfill.sh --stage prod --from 2026-03-01T00:00:00.000Z --to 2026-03-31T23:59:59.999Z --max-retries 7',
      './scripts/cheer-stats-backfill.sh --stage prod --total-segments 4 --failed-segments 1,3',
      './scripts/cheer-stats-backfill.sh --stage prod --orchestrator-arn <STATE_MACHINE_ARN> --execution-name cheer-stats-backfill-<yyyymmdd>'
    ],
    references: ['docs/cheer-stats-materializer-runbook.md']
  },
  {
    title: 'Materializer Runbook 실행 명령 (PowerShell)',
    description: 'Windows 운영자 기준 실행 예시입니다.',
    commands: [
      './scripts/cheer-stats-backfill.ps1 -Stage dev -DryRun',
      './scripts/cheer-stats-backfill.ps1 -Stage prod -FromIso 2026-03-01T00:00:00.000Z -ToIso 2026-03-31T23:59:59.999Z -MaxRetries 7',
      './scripts/cheer-stats-backfill.ps1 -Stage prod -TotalSegments 4 -FailedSegments 1,3',
      './scripts/cheer-stats-backfill.ps1 -Stage prod -OrchestratorArn <STATE_MACHINE_ARN> -ExecutionName cheer-stats-backfill-<yyyymmdd>'
    ],
    references: ['docs/cheer-stats-materializer-runbook.md']
  },
  {
    title: 'PHASE1 라이브 QA 핵심 체크리스트',
    description: '이번 스프린트 라이브 게이트 기준으로 최소 필수 항목만 선별했습니다.',
    checklist: [
      'Reply API: 정상/권한(403)/중복(409)/rate-limit(429) 검증',
      'Reaction API: 허용 이모지/비허용 이모지(400)/중복(409)/rate-limit(429)',
      'Stats API: period(all/day/week/month/challenge) + source(bucketed/realtime_fallback) 확인',
      'Today UI: reply/reaction 동작 후 my-cheers/cheer-stats invalidate 확인',
      'Materializer: dry-run 결과 기록 후 본실행, failedSegments 재실행 흐름 확인'
    ],
    references: ['docs/cheer-phase1-qa-sheet.md', 'docs/cheer-phase1-remaining-todo.md']
  }
];

function buildBackfillCommand(params: {
  stage: StageType;
  dryRun: boolean;
  totalSegments: number;
  failedSegments: string;
  maxScanPages: number;
  scanPageSize: number;
  maxRetries: number;
  orchestratorArn: string;
  executionName: string;
}): string {
  const parts = ['./scripts/cheer-stats-backfill.sh', '--stage', params.stage];

  if (params.dryRun) {
    parts.push('--dry-run');
  }
  parts.push('--max-retries', String(params.maxRetries));
  parts.push('--total-segments', String(params.totalSegments));
  parts.push('--max-scan-pages', String(params.maxScanPages));
  parts.push('--scan-page-size', String(params.scanPageSize));

  if (params.failedSegments.trim()) {
    parts.push('--failed-segments', params.failedSegments.trim());
  }

  if (params.orchestratorArn.trim()) {
    parts.push('--orchestrator-arn', params.orchestratorArn.trim());
    if (params.executionName.trim()) {
      parts.push('--execution-name', params.executionName.trim());
    }
  }

  return parts.join(' ');
}

async function copyText(value: string): Promise<void> {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export const AdminDocsPage = () => {
  const generatedAt = useMemo(() => new Date().toLocaleString('ko-KR'), []);
  const [stage, setStage] = useState<StageType>('prod');
  const [dryRun, setDryRun] = useState(true);
  const [totalSegments, setTotalSegments] = useState(4);
  const [failedSegments, setFailedSegments] = useState('');
  const [maxScanPages, setMaxScanPages] = useState(20);
  const [scanPageSize, setScanPageSize] = useState(500);
  const [maxRetries, setMaxRetries] = useState(7);
  const [orchestratorArn, setOrchestratorArn] = useState('');
  const [executionName, setExecutionName] = useState('');

  const generatedCommand = useMemo(
    () =>
      buildBackfillCommand({
        stage,
        dryRun,
        totalSegments,
        failedSegments,
        maxScanPages,
        scanPageSize,
        maxRetries,
        orchestratorArn,
        executionName
      }),
    [stage, dryRun, totalSegments, failedSegments, maxScanPages, scanPageSize, maxRetries, orchestratorArn, executionName]
  );

  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    if (totalSegments < 1) messages.push('totalSegments는 1 이상이어야 합니다.');
    if (maxScanPages < 1) messages.push('maxScanPages는 1 이상이어야 합니다.');
    if (scanPageSize < 1 || scanPageSize > 1000) messages.push('scanPageSize는 1~1000 범위여야 합니다.');
    if (maxRetries < 0) messages.push('maxRetries는 0 이상이어야 합니다.');
    if (executionName.trim() && !orchestratorArn.trim()) {
      messages.push('executionName은 orchestratorArn과 함께 사용해야 합니다.');
    }
    return messages;
  }, [executionName, maxRetries, maxScanPages, orchestratorArn, scanPageSize, totalSegments]);

  const handleCopy = async () => {
    try {
      await copyText(generatedCommand);
      toast.success('백필 명령어를 복사했어요.');
    } catch {
      toast.error('명령어 복사에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Admin Docs Hub · Cheer PHASE1</h1>
        <p className="text-sm text-gray-500 mt-1">
          라이브 테스트 운영자가 바로 실행 가능한 명령/체크리스트를 한곳에서 조회합니다.
        </p>
        <p className="text-xs text-gray-400 mt-2">Generated: {generatedAt}</p>
      </div>

      <div className="p-6 space-y-4">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="font-bold text-emerald-900">이번 스프린트 3종 고정</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-emerald-900 space-y-1">
            {SPRINT_LOCKS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <h2 className="font-bold text-indigo-900">Backfill Command Builder</h2>
          <p className="text-xs text-indigo-800">
            운영 파라미터를 입력하면 실행용 백필 명령을 생성합니다. runbook 표준과 동일한 제약을 적용합니다.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-gray-700">stage</span>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as StageType)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              >
                <option value="dev">dev</option>
                <option value="prod">prod</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-gray-700">totalSegments</span>
              <input
                type="number"
                min={1}
                value={totalSegments}
                onChange={(e) => setTotalSegments(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-gray-700">maxRetries</span>
              <input
                type="number"
                min={0}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-gray-700">maxScanPages</span>
              <input
                type="number"
                min={1}
                value={maxScanPages}
                onChange={(e) => setMaxScanPages(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-gray-700">scanPageSize</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={scanPageSize}
                onChange={(e) => setScanPageSize(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-gray-700">failedSegments (csv)</span>
              <input
                value={failedSegments}
                onChange={(e) => setFailedSegments(e.target.value)}
                placeholder="예: 1,3"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-gray-700">orchestratorArn (optional)</span>
              <input
                value={orchestratorArn}
                onChange={(e) => setOrchestratorArn(e.target.value)}
                placeholder="arn:aws:states:..."
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-gray-700">executionName (optional)</span>
              <input
                value={executionName}
                onChange={(e) => setExecutionName(e.target.value)}
                placeholder="cheer-stats-backfill-yyyymmdd"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            dryRun 포함
          </label>

          {validationMessages.length > 0 && (
            <ul className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs p-3 list-disc pl-5 space-y-1">
              {validationMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <pre className="overflow-x-auto rounded-xl bg-gray-900 text-gray-100 text-xs p-3">{generatedCommand}</pre>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-2 hover:bg-indigo-700"
            >
              명령어 복사
            </button>
          </div>
        </section>

        {DOC_SECTIONS.map((section) => (
          <section key={section.title} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
            <p className="text-sm text-gray-600">{section.description}</p>

            {section.commands && section.commands.length > 0 && (
              <div className="space-y-2">
                {section.commands.map((command) => (
                  <pre key={command} className="overflow-x-auto rounded-xl bg-gray-900 text-gray-100 text-xs p-3">
                    {command}
                  </pre>
                ))}
              </div>
            )}

            {section.checklist && section.checklist.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {section.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}

            {section.references && section.references.length > 0 && (
              <div className="text-xs text-gray-500">
                <span className="font-semibold">References:</span> {section.references.join(' · ')}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};
