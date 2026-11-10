// Builds an explicit, reviewable migration; never infer clinical meaning from
// an intermediate vaccination state or an unavailable/not-requested result.
export function planPrepCnvAlignment(metadata, rows) {
  const target = structuredClone(metadata);
  const find = name => target.find(field => field.field_name === name);
  const requireField = name => { const field = find(name); if (!field) throw Error(`Missing field: ${name}`); return field; };
  if (find('pv_hiv_lab_test_done')) throw Error('PrEP alignment fields already exist; do not prepare again.');
  const changedNames = new Set();
  function patch(name, values) { Object.assign(requireField(name), values); changedNames.add(name); }
  function insertBefore(name, templateName, values) {
    const template = requireField(templateName);
    const item = { ...structuredClone(template), form_name: 'prep_visit', section_header: '', required_field: '', field_annotation: '', ...values };
    target.splice(target.findIndex(field => field.field_name === name), 0, item);
    changedNames.add(item.field_name);
  }
  const purpose = "[pv_visit_purpose(4)] = '1'";
  const blood = "[pv_visit_purpose(1)] = '1'", doctor = "[pv_visit_purpose(2)] = '1'", medication = "[pv_visit_purpose(3)] = '1'";
  patch('pv_visit_purpose', { select_choices_or_calculations: requireField('pv_visit_purpose').select_choices_or_calculations + ' | 4, Laboratory results review' });
  const results = { hiv: 'pv_hiv_result', hbv: 'pv_hbv_result', hcv: 'pv_hcv_result', syp: 'pv_syphilis_result' };
  for (const [infection, result] of Object.entries(results)) {
    const template = requireField(`cnv_${infection}_lab_result`);
    if (infection !== 'syp') {
      if (requireField(result).select_choices_or_calculations.replace(/\s+/g,'') !== '1,Negative/normal|2,Positive/abnormal|3,Indeterminate|4,Resultunavailable|5,Notrequested') throw Error('Unexpected legacy result choices.');
    }
    const section = requireField(result).section_header;
    insertBefore(result, `cnv_${infection}_lab_test_done`, { field_name: `pv_${infection}_lab_test_done`, section_header: section, branching_logic: purpose });
    insertBefore(result, `cnv_${infection}_lab_test_date`, { field_name: `pv_${infection}_lab_test_date`, branching_logic: `(${purpose}) and ([pv_${infection}_lab_test_done] = '1')` });
    patch(result, { field_type: 'radio', field_label: template.field_label, section_header: '', select_choices_or_calculations: template.select_choices_or_calculations, branching_logic: `(${purpose}) and ([pv_${infection}_lab_test_done] = '1')` });
  }
  for (const infection of ['hbv','hcv']) {
    const template = requireField(`cnv_${infection}_vaccination_status`);
    patch(`pv_${infection}_vaccination_status`, { field_label: template.field_label, select_choices_or_calculations: template.select_choices_or_calculations, branching_logic: purpose });
  }
  // Other results retain their existing input semantics, but are no longer
  // writable during an unrelated blood-only/medication-only visit.
  for (const name of ['pv_creatinine_result','pv_hbsag_result','pv_hb_result','pv_cholesterol_result','pv_triglycerides_result','pv_tpha_result','pv_vdrl_result','pv_other_test_result','pv_syphilis_referral','pv_hcv_referral','pv_hbv_referral','pv_other_referral']) patch(name, { branching_logic: purpose });
  for (const name of ['pv_blood_collected','pv_next_blood_date']) patch(name, { branching_logic: blood });
  for (const name of ['pv_blood_collected_date','pv_blood_draw_notes']) patch(name, { branching_logic: `(${blood}) and ([pv_blood_collected] = '1')` });
  for (const name of ['pv_doctor','pv_weight','pv_bp_systolic','pv_bp_diastolic','pv_doctor_comments','pv_next_doctor_date']) patch(name, { branching_logic: doctor });
  for (const name of ['pv_medication','pv_other_medication','pv_lot_number','pv_medication_dispensed','pv_prescription_months','pv_next_med_date']) patch(name, { branching_logic: medication });
  insertBefore('pv_syphilis_referral', 'cnv_next_lab_review_date', { field_name: 'pv_next_lab_review_date', section_header: '', branching_logic: purpose });
  const priorCalculation = requireField('pv_next_appointment_date').field_annotation.match(/^@CALCTEXT\(([\s\S]*)\)$/)?.[1];
  if (!priorCalculation) throw Error('Unexpected PrEP appointment calculation.');
  patch('pv_next_appointment_date', { field_annotation: `@CALCTEXT(if(isblankormissingcode([pv_next_lab_review_date]), (${priorCalculation}), if(isblankormissingcode((${priorCalculation})), [pv_next_lab_review_date], if([pv_next_lab_review_date] <= (${priorCalculation}), [pv_next_lab_review_date], (${priorCalculation})))))` });
  const changes = [];
  for (const row of rows) {
    if (row.redcap_repeat_instrument !== 'prep_visit') continue;
    const values = {};
    let hasReview = false;
    for (const [infection, result] of Object.entries(results)) {
      const old = String(row[result] ?? '').trim();
      if (!old) continue;
      let value;
      if (infection === 'syp') {
        if (!['1','2','3','4'].includes(old)) throw Error('Unexpected syphilis value; review before migration.');
        value = old;
      } else {
        value = { '1': '2', '2': '1', '3': '3' }[old];
        if (!value) throw Error('Unavailable/not-requested/unknown legacy result needs review; no remote changes.');
      }
      if (value !== row[result]) values[result] = value;
      values[`pv_${infection}_lab_test_done`] = '1';
      // Do not invent per-infection dates from a shared collection/visit date.
      hasReview = true;
    }
    for (const infection of ['hbv','hcv']) {
      const name = `pv_${infection}_vaccination_status`, old = String(row[name] ?? '').trim();
      if (!old) continue;
      const value = (infection === 'hbv' ? { '0':'0', '5':'4' } : { '0':'0', '4':'5' })[old];
      if (value === undefined) throw Error('Intermediate legacy vaccination state needs review; no remote changes.');
      if (value !== row[name]) values[name] = value;
      hasReview = true;
    }
    if (target.some(field => field.form_name === 'prep_visit' && field.branching_logic === purpose && row[field.field_name]?.trim())) hasReview = true;
    if (hasReview && row.pv_visit_purpose___4 !== '1') values.pv_visit_purpose___4 = '1';
    if (Object.keys(values).length) changes.push({ identity: { uic_ori: row.uic_ori, ...(row.redcap_event_name ? { redcap_event_name: row.redcap_event_name } : {}), redcap_repeat_instrument: 'prep_visit', redcap_repeat_instance: row.redcap_repeat_instance }, values });
  }
  return { metadata: target, changedNames: [...changedNames], changes };
}
