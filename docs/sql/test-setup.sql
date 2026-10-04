-- ============================================================================
-- TEST SETUP — two fake companies and three fake logins (NO real data)
-- ============================================================================
-- Purpose: prove that company A never sees company B.
--
-- Step 1: In Supabase -> Authentication -> Users -> "Add user" -> "Create new user",
--         create these three logins (tick "Auto Confirm User"), each with a password you choose:
--           a-chef@test.de          (boss of Testfirma A)
--           a-mitarbeiter@test.de   (an employee of Testfirma A)
--           b-chef@test.de          (boss of Testfirma B)
-- Step 2: Copy each login's "User UID" and paste it below instead of the zeros.
-- Step 3: Run this script in the SQL Editor (once).
--
-- What you get:
--   Testfirma A  — products: lab_planner + employee_app   — people: Anna A., Ben A.
--   Testfirma B  — products: generic_planner only         — people: Clara B., Dino B.
-- ============================================================================

do $$
declare
  uid_a_chef  uuid := '00000000-0000-0000-0000-000000000001';   -- <- a-chef@test.de
  uid_a_emp   uuid := '00000000-0000-0000-0000-000000000002';   -- <- a-mitarbeiter@test.de
  uid_b_chef  uuid := '00000000-0000-0000-0000-000000000003';   -- <- b-chef@test.de
  org_a       uuid;
  org_b       uuid;
  staff_anna  uuid;
begin
  if uid_a_chef = '00000000-0000-0000-0000-000000000001' then
    raise exception 'Bitte zuerst die drei echten User UIDs oben eintragen.';
  end if;

  org_a := create_organization('Testfirma A (Labor)', uid_a_chef, array['lab_planner', 'employee_app']);
  org_b := create_organization('Testfirma B (allgemein)', uid_b_chef, array['generic_planner']);

  insert into staff (org_id, name, email, weekly_hours) values (org_a, 'Anna A.', 'a-mitarbeiter@test.de', 38.5)
    returning id into staff_anna;
  insert into staff (org_id, name, weekly_hours) values (org_a, 'Ben A.', 38.5);
  insert into staff (org_id, name, weekly_hours) values (org_b, 'Clara B.', 38.5), (org_b, 'Dino B.', 20);

  insert into memberships (user_id, org_id, role, staff_id) values (uid_a_emp, org_a, 'employee', staff_anna);
end $$;

-- Expected result on the /konto page after the app is deployed:
--   a-chef@test.de         -> Testfirma A, Leitung/Inhaber, sees Anna A. and Ben A.      (not Clara/Dino)
--   a-mitarbeiter@test.de  -> Testfirma A, Mitarbeitende, sees ONLY Anna A. (herself)
--   b-chef@test.de         -> Testfirma B, Inhaber, sees Clara B. and Dino B.            (not Anna/Ben)
-- The "Sicherheits-Check" button must show two green checkmarks for every login.

-- To delete all test data again later:
--   delete from organizations where name like 'Testfirma%';
--   (the staff, products and memberships of those companies are removed automatically)
