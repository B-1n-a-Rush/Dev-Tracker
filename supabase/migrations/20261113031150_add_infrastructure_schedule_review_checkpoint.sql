alter table public.infrastructure_coordination_reviews
  add column reviewed_infrastructure_schedule jsonb
  check (reviewed_infrastructure_schedule is null or
    (jsonb_typeof(reviewed_infrastructure_schedule) = 'array'
      and octet_length(reviewed_infrastructure_schedule::text) <= 300));

comment on column public.infrastructure_coordination_reviews.reviewed_infrastructure_schedule is
  'Private checkpoint of the screened infrastructure date ranges and manual certainty at the time of review.';
