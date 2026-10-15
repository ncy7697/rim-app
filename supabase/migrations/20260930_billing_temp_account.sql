-- 임시 입금 계좌 + 월 이용료 5,000원

INSERT INTO public.app_billing_settings (id, bank_name, account_number, account_holder, monthly_fee, notice)
VALUES (
  1,
  '카카오뱅크',
  '3333-02-0001234',
  '림',
  5000,
  '개설 후 1개월은 무료입니다. 이후 매월 5,000원을 아래 계좌로 이체한 뒤 입금 확인을 요청해 주세요. 운영자가 입금을 확인하면 이용 기간이 연장됩니다. (계좌는 임시 번호이며 추후 변경됩니다.)'
)
ON CONFLICT (id) DO UPDATE SET
  bank_name = EXCLUDED.bank_name,
  account_number = EXCLUDED.account_number,
  account_holder = EXCLUDED.account_holder,
  monthly_fee = EXCLUDED.monthly_fee,
  notice = EXCLUDED.notice;
