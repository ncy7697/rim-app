ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS favorite_venues text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.clubs.favorite_venues IS '경기 일정에 쓰는 즐겨찾기 장소. 최대 3곳.';
