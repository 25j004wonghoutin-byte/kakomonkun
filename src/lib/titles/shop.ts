import type { TitleCondition, TitleShopItem } from "./contract";
import { TITLE_CATALOG } from "./catalog";

const categoryName = { technology: "テクノロジ", management: "マネジメント", strategy: "ストラテジ" };

export function titleConditionText(condition: TitleCondition): string {
  switch (condition.type) {
    case "answer_count": return `一日一問・ランダム出題・過去問練習で累計${condition.count}問回答する（同じ問題への再挑戦も対象）`;
    case "category_correct": return `${categoryName[condition.category]}分野で累計${condition.count}問正解する（すべての出題モードが対象）`;
    case "daily_answer_run": return `一日一問に${condition.count}日連続で回答する`;
    case "daily_incorrect_run": return `一日一問で${condition.count}日連続で不正解になる`;
    case "practice_first_complete": return "過去問練習ですべての問題に回答し、練習を終了する";
    case "practice_result": return `60問の過去問練習を最後まで回答して終了し、${condition.result === "perfect" ? "全問正解" : "全問不正解"}になる`;
    case "practice_perfect_run": return `過去問練習を${condition.count}回連続で全問正解して終了する（30問・60問、すべての試験が対象。途中終了は連続をリセット）`;
    case "random_correct_run": return `ランダム出題で日本時間の同じ日に${condition.count}問連続正解する`;
    case "activity_run": return `アプリを${condition.count}日連続で利用する（毎日の再ログインは不要）`;
    case "no_answer_activity_run": return `アプリを利用するが、どの出題モードにも回答しない日を${condition.count}日連続で続ける（翌日以降に判定）`;
    case "answer_run_then_break": return `${condition.count}日以上連続でアプリを利用・回答した後、${condition.breakDays}日以上利用せず、再び利用する`;
    case "return_gap": return `前回の利用から${condition.days}日以上たってから再び利用する（記録開始後の期間が対象）`;
    case "navigation_round_trips": return `ホーム → マイページ → ホームを累計${condition.count}往復する（更新・再表示だけでは数えません）`;
    case "owned_count": return `この称号以外の称号を${condition.count}種類所持する（初期称号・旧称号も対象）`;
    case "owned_set": return `ランキング系と「過去問くん」を除く、今回の対象称号${condition.keys.length}種類をすべて所持する`;
    case "name_changed": return "プロフィールの表示名を初めて別の名前に変更する（自己紹介だけの変更は対象外）";
    case "monthly_rank": return `確定した月間ランキングで${condition.rank}位になる`;
    case "monthly_rank_count": return `確定した月間ランキングで${condition.rank}位を累計${condition.count}回獲得する`;
    case "monthly_top_run": return `確定した月間ランキングで${condition.rank}位以内に${condition.count}か月連続で入る`;
    case "board_post_count": return `掲示板に累計${condition.count}回投稿する（削除済みの投稿も対象）`;
    case "board_comment_count": return `掲示板に累計${condition.count}回返信する（自己返信・削除済みの返信も対象）`;
  }
}

type ShopRow = { id: string; catalogKey: string | null; name: string; pricePoints: number; acquisitionKind: string | null; isActive: boolean; userTitles: readonly unknown[]; userTitleUnlocks: readonly unknown[] };

export function toTitleShopItems(rows: readonly ShopRow[], totalPoints: number): TitleShopItem[] {
  return rows.flatMap((row) => {
    const definition = TITLE_CATALOG.find((item) => item.key === row.catalogKey);
    if (!definition || (!row.isActive && row.userTitles.length === 0)) return [];
    const owned = row.userTitles.length > 0;
    const validPrice = definition.acquisitionKind === "condition" ? row.pricePoints === 0 : definition.acquisitionKind === "starter" ? true : row.pricePoints > 0;
    const eligible = definition.implemented && row.acquisitionKind === definition.acquisitionKind && validPrice && (definition.acquisitionKind === "points" || row.userTitleUnlocks.length > 0);
    const state = definition.acquisitionKind === "starter" ? "starter" : owned ? "owned" : !eligible || !row.isActive ? "locked" : row.pricePoints > totalPoints ? "insufficient" : "available";
    const conditionText = definition.condition ? titleConditionText(definition.condition) + (!definition.implemented ? "。ランキング機能は未実装のため、現在は購入条件を判定しません。" : "") : null;
    return [{ id: row.id, key: definition.key, name: row.name, pricePoints: row.pricePoints, owned, state, implemented: definition.implemented, conditionText }];
  });
}

export function titleShopAction(title: TitleShopItem, totalPoints: number): "none" | "condition" | "purchase" {
  if (title.owned || title.state === "starter") return "none";
  if (title.state === "locked") return "condition";
  return totalPoints < title.pricePoints ? "none" : "purchase";
}
