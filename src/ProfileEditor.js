// Редактор «Слово дня під тебе» — ті самі кроки, що в онбордингу (цілі →
// сфера → рівень), але з хрестиком замість «Пропустити» і кнопкою
// «Зберегти» на останньому кроці.
//
// Це не нативний Modal: App малює його власним шаром поверх вкладок, як
// пейвол. Відкривають його з Параметрів і з картки на вкладці навчання, а
// там уже може бути відкритий інший шар — два нативні Modal iOS разом не
// показує.
import { useState } from 'react';
import { GradBtn } from './ui';
import { DEFAULT_LEVEL, profileFromAnswers, studyOnly } from './profile';
import { CloseButton, FieldOptions, GoalOptions, LangPill, LevelBody, StepFrame, profileSteps } from './ProfileSteps';

// profile — поточний (або null); onSave(profile) — лише якщо щось змінилось,
// інакше просто onClose: «Зберегти» без змін не скидає чергу тем.
export default function ProfileEditor({ profile, targetLang, onSave, onClose, t }) {
  const [step, setStep] = useState('goals');
  const [goals, setGoals] = useState(profile?.goals || []);
  const [field, setField] = useState(profile?.field || null);
  const [level, setLevel] = useState(profile?.level ?? DEFAULT_LEVEL);

  const steps = profileSteps(goals);
  const i = Math.max(0, steps.indexOf(step));
  const last = i === steps.length - 1;

  function next() {
    if (!last) {
      setStep(steps[i + 1]);
      return;
    }
    const updated = profileFromAnswers({ goals, field, level }, profile);
    if (updated && updated !== profile) onSave(updated);
    else onClose();
  }

  const frame = {
    stepKey: step,
    progress: { step: i + 1, total: steps.length },
    onBack: i > 0 ? () => setStep(steps[i - 1]) : null,
    right: <CloseButton onPress={onClose} t={t} />,
    t,
  };
  const action = last ? t('save') : t('obNext');

  if (step === 'field') {
    return (
      <StepFrame
        {...frame}
        title={studyOnly(goals) ? t('pfFieldTitleStudy') : t('pfFieldTitle')}
        text={t('pfFieldText')}
        footer={<GradBtn title={action} onPress={next} disabled={!field} />}
      >
        <FieldOptions value={field} onChange={setField} t={t} />
      </StepFrame>
    );
  }
  if (step === 'level') {
    return (
      <StepFrame
        {...frame}
        header={<LangPill code={targetLang} />}
        title={t('pfLevelTitle')}
        text={t('pfLevelText')}
        footer={<GradBtn title={action} onPress={next} />}
      >
        <LevelBody value={level} onChange={setLevel} t={t} />
      </StepFrame>
    );
  }
  return (
    <StepFrame
      {...frame}
      title={t('pfGoalsTitle')}
      text={t('pfGoalsText')}
      footer={<GradBtn title={action} onPress={next} disabled={!goals.length} />}
    >
      <GoalOptions value={goals} onChange={setGoals} t={t} />
    </StepFrame>
  );
}
