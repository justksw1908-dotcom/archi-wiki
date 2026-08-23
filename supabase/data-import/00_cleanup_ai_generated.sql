-- 기존에 같이 만든 프로토타입 위키(1104개 문서)를 통째로 이식하기 전에,
-- 그 전에 AI 생성 테스트로 만들어졌던 문서들을 먼저 정리한다.
-- AI가 만든 문서는 wiki_pages.source_chunk_id가 채워져 있고(어떤 청크에서 만들어졌는지 기록),
-- 지금부터 이식할 프로토타입 문서는 source_chunk_id를 비워두므로(수동/이식 문서라는 뜻) 이 값으로
-- 안전하게 구분해서 지울 수 있다.
delete from wiki_links
where from_page_id in (select id from wiki_pages where source_chunk_id is not null)
   or to_page_id in (select id from wiki_pages where source_chunk_id is not null);

delete from pending_changes
where target_page_id in (select id from wiki_pages where source_chunk_id is not null);

delete from wiki_pages
where source_chunk_id is not null;
