// Phase 6 (수정) 중 발견: Supabase REST API(PostgREST)는 한 번의 select에 기본 최대 1000행까지만
// 돌려준다(대시보드 Settings > API > Max Rows, 기본값 1000). 위키 문서가 1104개(1000개 초과)라
// .range() 없이 select만 하면 뒤쪽(정렬 기준으로 6장)이 잘려서 안 보이는 문제가 실제로 발생했다.
// quiz_items도 문서당 여러 문항이 쌓이므로 결국 같은 한도에 걸릴 수 있어 똑같이 처리해야 한다.
// 이 함수는 .range()로 PAGE_SIZE(1000)씩 나눠 끝까지 반복 조회해서 전체 행을 모아준다.
import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  opts?: {
    orderColumn?: string;
    ascending?: boolean;
    ilike?: { column: string; pattern: string };
  }
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (opts?.orderColumn) query = query.order(opts.orderColumn, { ascending: opts.ascending ?? true });
    if (opts?.ilike) query = query.ilike(opts.ilike.column, opts.ilike.pattern);
    const { data, error } = await query;
    if (error) return { data: null, error };
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break; // 마지막 페이지 (덜 채워졌으면 더 없다는 뜻)
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}
