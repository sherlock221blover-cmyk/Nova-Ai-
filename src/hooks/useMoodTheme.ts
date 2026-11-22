import { useEffect } from 'react';
import { MoodType } from '../types/nova';

export function useMoodTheme(currentMood?: MoodType) {
  useEffect(() => {
    const root = document.documentElement;
    // Reset defaults first
    root.style.removeProperty('--nova-accent-color');
    root.style.removeProperty('--nova-glow-color');
    root.style.removeProperty('--nova-bg-tint');

    if (!currentMood) return;

    switch (currentMood) {
      case 'happy':
        root.style.setProperty('--nova-accent-color', '#38bdf8'); // sky-400
        root.style.setProperty('--nova-glow-color', 'rgba(56, 189, 248, 0.25)');
        root.style.setProperty('--nova-bg-tint', 'rgba(14, 165, 233, 0.04)');
        break;
      case 'calm':
        root.style.setProperty('--nova-accent-color', '#2dd4bf'); // teal-400
        root.style.setProperty('--nova-glow-color', 'rgba(45, 212, 191, 0.25)');
        root.style.setProperty('--nova-bg-tint', 'rgba(20, 184, 166, 0.04)');
        break;
      case 'excited':
        root.style.setProperty('--nova-accent-color', '#f43f5e'); // rose-500
        root.style.setProperty('--nova-glow-color', 'rgba(244, 63, 94, 0.3)');
        root.style.setProperty('--nova-bg-tint', 'rgba(244, 63, 94, 0.05)');
        break;
      case 'tired':
        root.style.setProperty('--nova-accent-color', '#818cf8'); // indigo-400
        root.style.setProperty('--nova-glow-color', 'rgba(129, 140, 248, 0.2)');
        root.style.setProperty('--nova-bg-tint', 'rgba(99, 102, 241, 0.03)');
        break;
      case 'sad':
      case 'anxious':
      case 'stressed':
      case 'overwhelmed':
        root.style.setProperty('--nova-accent-color', '#38bdf8'); // supportive soft sky
        root.style.setProperty('--nova-glow-color', 'rgba(56, 189, 248, 0.35)');
        root.style.setProperty('--nova-bg-tint', 'rgba(14, 165, 233, 0.06)');
        break;
      default:
        break;
    }
  }, [currentMood]);
}
