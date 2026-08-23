-- ============================================================
-- Supabase Storage 설정 (Phase 3)
-- schema.sql 실행 뒤에 이 파일도 SQL Editor에서 실행하세요.
-- 업로드 원본 파일을 담을 비공개 버킷 + "본인 폴더만 접근 가능" 정책.
-- ============================================================

-- source-files 버킷 생성 (비공개 — public=false, URL을 안다고 누구나 못 봄)
insert into storage.buckets (id, name, public)
values ('source-files', 'source-files', false)
on conflict (id) do nothing;

-- 업로드 경로 규칙: source-files/{user_id}/{파일명}
-- storage.foldername(name)은 경로를 '/'로 나눈 배열을 주므로, 첫 번째 폴더가
-- 자기 user_id와 같은 파일에만 select/insert/update/delete를 허용한다.
create policy "source_files_owner_select" on storage.objects
  for select using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source_files_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source_files_owner_update" on storage.objects
  for update using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source_files_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
