begin;

-- Source: Roseman University Student Organizations & Clubs directory supplied
-- for this implementation. College of Medicine rows are the initial pilot set.
insert into public.genesis_organizations
  (directory_key, name, college, campus, mission, advisor, aliases, source_date, pilot_available, sort_priority)
values
  ('aans-rucom','American Association of Neurological Surgery (AANS) Roseman University College of Medicine Student Chapter','College of Medicine','Henderson','Build student exposure to neurological surgery through education and professional connection.','Dr. Daniel Van Tonder',array['AANS'],'2026-09-10',true,1),
  ('anesthesiology-interest-group','Anesthesiology Interest Group','College of Medicine','Henderson','Create anesthesiology exposure through workshops, mentorship, and shadowing pathways.','Dr. Daniel Van Tonder',array['AIG'],'2026-09-10',true,1),
  ('apamsa','Asian Pacific American Medical Student Association','College of Medicine','Henderson','Promote AANHPI community health through outreach, education, and advocacy.','Dr. Julpohng JP Vilai',array['APAMSA'],'2026-09-10',true,1),
  ('arts-in-medicine','Arts in Medicine','College of Medicine','Henderson','Cultivate empathy through the arts and medical humanities.','Inaia Phoenix','{}','2026-09-10',true,1),
  ('business-in-medicine','Business in Medicine','College of Medicine','Henderson','Build business and financial literacy for sustainable patient-centered practice.','Dr. Farzad Kamyar','{}','2026-09-10',true,1),
  ('diga','Dermatology Interest Group Association','College of Medicine','Henderson','Support dermatology interest through service, education, and mentorship.','Dr. Sarah Bovenberg',array['DIGA'],'2026-09-10',true,1),
  ('emig','Emergency Medicine Interest Group','College of Medicine','Henderson','Explore emergency medicine through education, mentorship, and career exposure.','Dr. Thomas Swoboda',array['EMIG'],'2026-09-10',true,1),
  ('healthcare-policy-club','Healthcare Policy Club','College of Medicine','Henderson','Prepare future physicians for policy, systems change, and health-equity advocacy.','Judy Hanrahan','{}','2026-09-10',true,1),
  ('imig','Internal Medicine Interest Group','College of Medicine','Henderson','Explore internal medicine through mentorship, education, scholarship, and service.','Dr. Nirupa Paulraj',array['IMIG'],'2026-09-10',true,1),
  ('kern-national-network','Kern National Network','College of Medicine','Henderson','Help future healthcare providers flourish through caring, character, and practical wisdom.','Jennifer Haley',array['KNN'],'2026-09-10',true,1),
  ('nature-and-nurture','Nature and Nurture','College of Medicine','Henderson','Connect environmental sustainability, human health, and community well-being.','Dr. Amanda Koziel','{}','2026-09-10',true,1),
  ('oncology-student-interest-group','Oncology Student Interest Group','College of Medicine','Henderson','Cultivate oncology interest through mentorship, research, education, and outreach.','Dr. Joseph Lasky',array['OSIG'],'2026-09-10',true,1),
  ('open-door-health-initiative','Open Door Health Initiative','College of Medicine','Henderson','Advance compassionate, equitable care with underserved and unhoused Las Vegas communities.','Dr. Daniel Moses',array['ODHI'],'2026-09-10',true,1),
  ('pediatrics-interest-group','Pediatrics Interest Group at RUCOM','College of Medicine','Henderson','Explore pediatrics through mentorship, clinical exposure, service, and health literacy.','Dr. Julpohng JP Vilai',array['PIG'],'2026-09-10',true,1),
  ('pmr-interest-group','Physical Medicine and Rehabilitation Interest Group','College of Medicine','Henderson','Support student exploration of physical medicine and rehabilitation.','Dr. Nirupa Paulraj',array['PM&R Interest Group'],'2026-09-10',true,1),
  ('primary-care-interest-group','Primary Care Interest Group','College of Medicine','Henderson','Expose students to generalist and primary-care fields.','Dr. Caitlin White',array['PCIG'],'2026-09-10',true,1),
  ('psychsign','Psychiatry Student Interest Group Network','College of Medicine','Henderson','Advance psychiatry knowledge, community wellness, and open mental-health discussion.','Dr. Farzad Kamyar',array['PsychSIGN'],'2026-09-10',true,1),
  ('student-community-outreach-program','Student Community Outreach Program','College of Medicine','Henderson','Partner with communities on culturally sensitive education and sustained wellness.','Dr. Daniel Moses',array['SCOP'],'2026-09-10',true,1),
  ('sar','The Surgical, Anatomical, and Radiological Interest Group','College of Medicine','Henderson','Foster surgery, anatomy, and radiology exposure through hands-on learning and mentorship.','Dr. Dietrich Lorke',array['SAR'],'2026-09-10',true,1),
  ('vamsa','Vietnamese American Medical Student Association','College of Medicine','Henderson','Improve Vietnamese community health outcomes through service and cultural connection.','Dr. Sydney Phan',array['VAMSA'],'2026-09-10',true,1),

  ('black-student-union','Black Student Union','University-wide','Henderson','Provide a safe place and uplift minority students through leadership and partnership.','Dr. Arup Chakraborty',array['BSU'],'2026-09-10',false,10),
  ('cmda','Christian Medical & Dental Association','University-wide','Multiple campuses','Integrate faith and healthcare through compassionate service, fellowship, and ethical dialogue.','Dr. Claudia Freitas',array['CMDA'],'2026-09-10',false,10),
  ('daat','Drug Abuse Awareness Team','University-wide','Henderson','Educate young people about drug misuse and addiction.','Dr. Krystal Riccio',array['DAAT'],'2026-09-10',false,10),
  ('ldssa','Latter-day Saints Student Association','University-wide','South Jordan','Create an open community for fellowship and shared learning.','Dr. Casey Sayre',array['LDSSA'],'2026-09-10',false,10),
  ('mesanv','Middle Eastern Students Association of Nevada','University-wide','Henderson','Empower minorities and advance culturally responsive healthcare.','TBD',array['MESANV'],'2026-09-10',false,10),
  ('path','Pan-Asians Towards Healthcare','University-wide','Henderson','Increase representation and cultural competence in healthcare.','Dr. Christopher So',array['PATH'],'2026-09-10',false,10),
  ('ru-jewish-club','RU Jewish Club','University-wide','Henderson','Offer an inclusive environment to learn and share Jewish traditions.','Professor Nancy Bryan','{}','2026-09-10',false,10),
  ('lgbtqa','RUHS Lesbian, Gay, Bisexual, Transgender, Queer, Ally Student Association','University-wide','Henderson and South Jordan','Create a safe LGBTQA community and promote wellness in healthcare.','Dr. Erik Dillon; Dr. Barbara Tanner; Professor Natalie Maughan',array['LGBTQA'],'2026-09-10',false,10),
  ('sga','Student Government Association','University-wide','Henderson and South Jordan','Represent Roseman students and serve as the student-body voice.','Dr. Surajit Dey',array['SGA'],'2026-09-10',false,10),

  ('aorn','Association of periOperative Registered Nurses Student Chapter','College of Nursing','Henderson','Prepare nursing students for perioperative practice and patient safety.','Katie Dobson',array['AORN'],'2026-09-10',false,20),
  ('aapina-rusna','Asian American Pacific Islander Nurses Association of Nevada – Roseman University Student Nurses Association','College of Nursing','Henderson','Support AAPI nurses and students and advance community health.','Professor Esperanza Obasi',array['AAPINA of Nevada – RUSNA'],'2026-09-10',false,20),
  ('black-student-nurses','Black Student Nurses Association','College of Nursing','Henderson','Empower, support, and educate Black nursing students.','Dorshey Dean',array['BSNA'],'2026-09-10',false,20),
  ('ccesna','Critical Care and Emergency Student Nurses Association','College of Nursing','Henderson and South Jordan','Prepare students for critical and emergency nursing through education and service.','Dr. Barbara Tanner; Professor Victor Venegas',array['CCESNA'],'2026-09-10',false,20),
  ('ghsna','Global Health Student Nurses Association','College of Nursing','Henderson','Connect nursing students with local and global service.','Dr. Andrea LeClaire',array['GHSNA'],'2026-09-10',false,20),
  ('honor-society-nursing','Honor Society of Nursing','College of Nursing','Henderson and South Jordan','Recognize nursing scholarship, leadership, and service.','Dr. Fred Calixtro; Dr. Beth Green','{}','2026-09-10',false,20),
  ('sna','Student Nurses’ Association','College of Nursing','Henderson and South Jordan','Connect student nurses with professional development and community health.','Professor Stephanie Mastin; Professor Natalie Maughan',array['SNA'],'2026-09-10',false,20),
  ('mansna','Maternal and Neonatal Student Nurses’ Association','College of Nursing','Henderson and South Jordan','Develop students interested in women’s, obstetric, and neonatal healthcare.','Professor Melissa Willden; Professor Stacey Smith; Dr. Barbara Tanner',array['MANSNA'],'2026-09-10',false,20),

  ('amcp','Academy of Managed Care Pharmacy','College of Pharmacy','Henderson and South Jordan','Prepare students for managed care pharmacy.','Dr. Danielle Gundrum',array['AMCP'],'2026-09-10',false,30),
  ('aaps','American Association of Pharmaceutical Scientists','College of Pharmacy','Henderson','Build research, presentation, and pharmaceutical-science experience.','Dr. Arup Chakraborty',array['AAPS'],'2026-09-10',false,30),
  ('sccp','Student College of Clinical Pharmacy','College of Pharmacy','Henderson','Support clinical pharmacy careers, residencies, and fellowships.','Dr. Evan Williams',array['SCCP'],'2026-09-10',false,30),
  ('ascp','American Society of Consultant Pharmacists','College of Pharmacy','Henderson','Develop senior-care pharmacy knowledge and service.','Dr. Catherine Oswald; Dr. Michelle Hon',array['ASCP'],'2026-09-10',false,30),
  ('kappa-psi','Kappa Psi Pharmaceutical Fraternity, Inc.','College of Pharmacy','Henderson and South Jordan','Advance pharmacy through fellowship, scholarship, and service.','Dr. Alana Whittaker; Dr. Danielle Gundrum',array['Kappa Psi'],'2026-09-10',false,30),
  ('ipho','Industry Pharmacists Organization','College of Pharmacy','Henderson','Advance industry-based pharmacy careers.','Dr. Surajit Dey',array['IPhO'],'2026-09-10',false,30),
  ('ncpa','National Community Pharmacists Association','College of Pharmacy','Henderson','Develop community pharmacy leadership, entrepreneurship, and advocacy.','Dr. Krystal Riccio',array['NCPA'],'2026-09-10',false,30),
  ('nhpa','National Hispanic Pharmacist Association Roseman University Student Chapter','College of Pharmacy','Henderson','Improve Hispanic community health through outreach and medication education.','Danielle Valls',array['NHPA'],'2026-09-10',false,30),
  ('phi-delta-chi','Phi Delta Chi','College of Pharmacy','Henderson and South Jordan','Develop pharmacy leaders through service and fellowship.','Dr. Arup Chakraborty; Dr. Quynh Nhu Doan; Dr. Scott Shipley',array['PDC'],'2026-09-10',false,30),
  ('phi-lambda-sigma','Phi Lambda Sigma','College of Pharmacy','Henderson and South Jordan','Promote and recognize leadership in pharmacy.','Dr. Ragini Bhakta; Dr. Tyler Rose',array['PLS'],'2026-09-10',false,30),
  ('student-alliance','Student Alliance','College of Pharmacy','Henderson and South Jordan','Support career preparation, service, networking, and leadership.','Dr. Mark Decerbo; Dr. Ken Kunke; Dr. Danielle Gundrum; Dr. Scott Shipley',array['SA','APhA','ASHP'],'2026-09-10',false,30),

  ('agd','Academy of General Dentistry Student Chapter','College of Dental Medicine','South Jordan','Advance general dentistry through education and advocacy.','Dr. David McMillan',array['AGD'],'2026-09-10',false,40),
  ('accessible-smiles','Accessible Smiles Alliance','College of Dental Medicine','South Jordan','Support dental students with disabilities and accessible patient care.','Dr. Kamran Awan','{}','2026-09-10',false,40),
  ('advanced-dental-education','Advanced Dental Education Club','College of Dental Medicine','South Jordan','Help students explore advanced dental education and applications.','TBD','{}','2026-09-10',false,40),
  ('adea','American Dental Education Association','College of Dental Medicine','South Jordan','Advance dental education and community oral-health education.','Dr. Robert Alder; Dr. Claudia Freitas',array['ADEA'],'2026-09-10',false,40),
  ('asda','American Student Dental Association','College of Dental Medicine','South Jordan','Protect and advance dental-student interests through advocacy.','Dr. Todd Bowman; Dr. Duane Callahan',array['ASDA'],'2026-09-10',false,40),
  ('aadsa','Asian American Dental Student Association','College of Dental Medicine','South Jordan','Promote Asian and Pacific Islander oral-health education and advocacy.','Larilyn Dang',array['AADSA'],'2026-09-10',false,40),
  ('dsa','Dental Student Association','College of Dental Medicine','South Jordan','Represent dental students and foster professionalism and collegiality.','Dr. Rachel Tomco Novak',array['DSA'],'2026-09-10',false,40),
  ('ensign-academy','Ensign Academy','College of Dental Medicine','South Jordan','Promote dental education, service, and fellowship.','Dr. Duane Callahan','{}','2026-09-10',false,40),
  ('hda','Hispanic Dental Association','College of Dental Medicine','South Jordan','Advance Hispanic community oral health in Utah.','Dr. David Densley',array['HDA'],'2026-09-10',false,40),
  ('lucy-hobbs','Lucy Hobbs Initiative','College of Dental Medicine','South Jordan','Empower women in dentistry through education, innovation, and equality.','Melanie Rindlisbacher','{}','2026-09-10',false,40),
  ('meda','Middle Eastern Dental Association','College of Dental Medicine','South Jordan','Celebrate Middle Eastern cultures and culturally informed care.','Dr. Mariana Pavlova',array['MEDA'],'2026-09-10',false,40),
  ('nsrg','National Student Research Group – Roseman College of Dental Medicine','College of Dental Medicine','South Jordan','Promote research, evidence-based dentistry, and interdisciplinary collaboration.','Dr. Man Hung',array['NSRG'],'2026-09-10',false,40),
  ('sncda','Special Needs Care Dentistry Association','College of Dental Medicine','South Jordan','Support students interested in special-care dentistry.','Dr. Ryan Moffat',array['SNCDA'],'2026-09-10',false,40),
  ('spea','Student Professionalism and Ethics Association in Dentistry','College of Dental Medicine','South Jordan','Support lifelong ethical behavior and professionalism.','Dr. Shannon Young',array['SPEA'],'2026-09-10',false,40),
  ('tau-sigma','Tau Sigma Military Dental Club','College of Dental Medicine','South Jordan','Support military-sponsored students and serve veterans through oral health.','Dr. Joseph Cheever',array['Tau Sigma'],'2026-09-10',false,40)
on conflict (directory_key) do update set
  name = excluded.name, college = excluded.college, campus = excluded.campus,
  mission = excluded.mission, advisor = excluded.advisor, aliases = excluded.aliases,
  source_date = excluded.source_date, pilot_available = excluded.pilot_available,
  sort_priority = excluded.sort_priority;

commit;
