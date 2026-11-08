/** Resource policy for the existing multi-scene E2E suite, not gameplay rules. */
export function browserPolicyError(
  argv: string[],
  env: Record<string, string | undefined>,
  platform: string,
): string | undefined {
  if (
    argv.includes("--list") &&
    !argv.some((arg) => arg.startsWith("--ui") || arg === "--debug")
  )
    return;
  if (platform === "darwin")
    return "此 Mac 的自動三人 E2E 已停用。請在資源合適的驗證主機執行；本機使用 npm test 收集案例，或手動只開一個遊戲畫面。";
  if (env.TANK_E2E_RESOURCE_READY !== "1")
    return "E2E 需要資源確認：TANK_E2E_RESOURCE_READY=1；此旗標不證明硬體足夠或已取得執行授權。";
  const budgets = argv.flatMap((arg, i) =>
    arg === "--global-timeout"
      ? [argv[i + 1]]
      : arg.startsWith("--global-timeout=")
        ? [arg.split("=")[1]]
        : [],
  );
  const budget = Number(budgets[0]);
  if (budgets.length !== 1 || !Number.isInteger(budget) || budget <= 0)
    return "請提供單一正整數 --global-timeout（毫秒）。";
  const full = env.TANK_FULL_REGRESSION === "1";
  if (budget > (full ? 4_500_000 : 600_000))
    return "針對性驗證上限10分鐘；明確完整回歸上限75分鐘。";
  if (
    !full &&
    (!argv.some((arg) => /^tests\/[^*]+\.spec\.ts$/.test(arg)) ||
      !argv.some(
        (arg) => arg === "-g" || arg === "--grep" || arg.startsWith("--grep="),
      ))
  )
    return "針對性驗證需指定 tests/*.spec.ts 與 -g/--grep；完整回歸需 TANK_FULL_REGRESSION=1。";
}

export function e2eArgumentError(argv: string[]): string | undefined {
  if (
    argv.some((arg) =>
      /^(--(?:output|reporter|config|repeat-each|ui|debug|list|workers)(?:=|$)|-[ocj])/.test(
        arg,
      ),
    )
  )
    return "輸出、reporter及單worker由入口管理；每次重複請使用獨立命令。收集案例請用 npm test。";
}
