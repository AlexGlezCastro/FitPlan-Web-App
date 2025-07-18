import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  query,
  onSnapshot,
  addDoc,
  getDocs,
  where
} from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Home, Settings, ClipboardList, PlusCircle, TrendingUp, User, ChevronDown, ChevronUp, X, Sparkles, RefreshCcw } from 'lucide-react';

// --- TU CONFIGURACIÓN DE FIREBASE ---
// ASEGÚRATE de que estos valores son los reales de tu consola de Firebase.
// Son cruciales para que tu app se conecte.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDWyF8yRI1itzgIYmc0RvkLOn02Mh78MKE", // ¡TU API KEY REAL AQUÍ!
  authDomain: "fitplan-architect.firebaseapp.com",
  projectId: "fitplan-architect",
  storageBucket: "fitplan-architect.firebasestorage.app",
  messagingSenderId: "905059219674",
  appId: "1:905059219674:web:a9a820a61dd79361de0de3" // ¡TU APP ID REAL AQUÍ!
};

// Usamos el appId de la configuración de Firebase para asegurar consistencia
const APP_ID = FIREBASE_CONFIG.appId;
const INITIAL_AUTH_TOKEN = null; // Mantén esto como null para autenticación anónima, o usa un token personalizado si lo implementas

// --- Firebase Context ---
const FirebaseContext = createContext(null);

// Firebase Provider Component
const FirebaseProvider = ({ children }) => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    try {
      const app = initializeApp(FIREBASE_CONFIG); // Usando FIREBASE_CONFIG directamente
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const signIn = async () => {
        try {
          if (INITIAL_AUTH_TOKEN) {
            await signInWithCustomToken(firebaseAuth, INITIAL_AUTH_TOKEN);
          } else {
            await signInAnonymously(firebaseAuth);
          }
        } catch (error) {
          console.error("Error during Firebase sign-in:", error);
          // Fallback a anónimo si custom token falla o no está disponible.
          // Asegúrate de que la autenticación anónima está habilitada en Firebase Console.
          await signInAnonymously(firebaseAuth);
        }
      };

      signIn();

      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          setUserId(user.uid);
          console.log("User ID:", user.uid);
        } else {
          // Genera un ID aleatorio si no autenticado (fallback para entornos sin usuario real)
          setUserId(crypto.randomUUID()); 
          console.log("Signed in anonymously or no user, generated random ID:", userId);
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
    }
  }, []);

  return (
    <FirebaseContext.Provider value={{ db, auth, userId, isAuthReady }}>
      {children}
    </FirebaseContext.Provider>
  );
};

// --- Custom Hook for Firebase Context ---
const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

// --- Utility Functions ---
const calculate1RM = (weight, reps) => {
  if (reps === 0) return 0;
  return parseFloat((weight / (1.0278 - 0.0278 * reps)).toFixed(2));
};

const calculateWeeklyVolume = (trainingLogs) => {
  const weeklyVolume = {};

  trainingLogs.forEach(log => {
    const date = new Date(log.date);
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    const weekKey = `${year}-${String(week).padStart(2, '0')}`;

    if (!weeklyVolume[weekKey]) {
      weeklyVolume[weekKey] = {};
    }

    log.exercises.forEach(exercise => {
      if (!weeklyVolume[weekKey][exercise.muscleGroup]) {
        weeklyVolume[weekKey][exercise.muscleGroup] = 0;
      }
      weeklyVolume[weekKey][exercise.muscleGroup] += exercise.sets.filter(s => s.rir >= 0 && s.rir <= 5).length;
    });
  });

  const chartData = Object.keys(weeklyVolume).sort().map(weekKey => {
    return {
      week: weekKey,
      ...weeklyVolume[weekKey]
    };
  });

  return chartData;
};

const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
};


// --- Components ---

const Modal = ({ show, onClose, title, children }) => {
  if (!show) {
    return null;
  }
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md transform transition-all duration-300 scale-95 md:scale-100">
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>
        <div className="text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
          {children}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-300"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

const SettingsPage = ({ userProfile, onSaveSettings, setShowModal, setModalMessage }) => {
  const [objectives, setObjectives] = useState(userProfile?.objectives || '');
  const [priorityMuscles, setPriorityMuscles] = useState(userProfile?.priorityMuscles || { max: [], primary: [], secondary: [], tertiary: [], maintenance: [] });
  const [initialVME, setInitialVME] = useState(userProfile?.initialVME || {});
  const [timeConstraints, setTimeConstraints] = useState(userProfile?.timeConstraints || '');

  useEffect(() => {
    if (userProfile) {
      setObjectives(userProfile.objectives || '');
      setPriorityMuscles(userProfile.priorityMuscles || { max: [], primary: [], secondary: [], tertiary: [], maintenance: [] });
      setInitialVME(userProfile.initialVME || {});
      setTimeConstraints(userProfile.timeConstraints || '');
    }
  }, [userProfile]);

  const handlePriorityMusclesChange = (category, value) => {
    setPriorityMuscles(prev => ({
      ...prev,
      [category]: value.split(',').map(m => m.trim()).filter(m => m)
    }));
  };

  const handleVMEChange = (muscle, value) => {
    const numValue = parseInt(value);
    setInitialVME(prev => ({
      ...prev,
      [muscle]: isNaN(numValue) ? '' : numValue
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSaveSettings({ objectives, priorityMuscles, initialVME, timeConstraints });
    setModalMessage("Configuración guardada con éxito.");
    setShowModal(true);
  };

  return (
    <div className="p-4 md:p-8 bg-gray-100 min-h-screen md:pl-64">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-3">Configuración del Perfil</h1>
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-md">
        <div>
          <label htmlFor="objectives" className="block text-sm font-medium text-gray-700 mb-1">
            Objetivos de Hipertrofia:
          </label>
          <textarea
            id="objectives"
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            rows="3"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Ej. Aumentar masa muscular general, enfocar en hombros y brazos."
          ></textarea>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Músculos Prioritarios (separados por coma):</label>
          {Object.keys(priorityMuscles).map(category => (
            <div key={category} className="mb-4">
              <label htmlFor={`priority-${category}`} className="block text-xs font-semibold text-gray-600 mb-1 capitalize">
                {category}
              </label>
              <input
                type="text"
                id={`priority-${category}`}
                value={priorityMuscles[category].join(', ')}
                onChange={(e) => handlePriorityMusclesChange(category, e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder={`Ej. ${category === 'max' ? 'Pecho, Espalda' : 'Bíceps, Tríceps'}`}
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estimación VME Inicial (Series por músculo):</label>
          <p className="text-xs text-gray-500 mb-2">Basado en conexión mente-músculo, bombeo y perturbación muscular (escala 0-3).</p>
          <div className="grid grid-cols-2 gap-4">
            {['Pecho', 'Espalda', 'Hombros', 'Brazos', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas', 'Abdominales'].map(muscle => (
              <div key={muscle}>
                <label htmlFor={`vme-${muscle}`} className="block text-xs font-semibold text-gray-600 mb-1">{muscle}</label>
                <input
                  type="number"
                  id={`vme-${muscle}`}
                  value={initialVME[muscle] || ''}
                  onChange={(e) => handleVMEChange(muscle, e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Ej. 8"
                  min="0"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="timeConstraints" className="block text-sm font-medium text-gray-700 mb-1">
            Restricciones de Tiempo/Recursos:
          </label>
          <textarea
            id="timeConstraints"
            value={timeConstraints}
            onChange={(e) => setTimeConstraints(e.target.value)}
            rows="2"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Ej. Entreno 3 veces por semana, 60 minutos por sesión."
          ></textarea>
        </div>

        <button
          type="submit"
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-300"
        >
          Guardar Configuración
        </button>
      </form>
    </div>
  );
};

const LogTrainingPage = ({ onAddTrainingLog, trainingLogs, userProfile, setShowModal, setModalMessage }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [exercises, setExercises] = useState([
    {
      name: '',
      muscleGroup: '',
      sets: [{ reps: '', load: '', rir: '', mindMuscle: '', pump: '', musclePerturbation: '' }],
      performanceScore: '',
      painScore: '',
      notes: '',
      showSubjectiveMetrics: false
    }
  ]);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [exerciseToSuggest, setExerciseToSuggest] = useState('');
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  const muscleGroups = ['Pecho', 'Espalda', 'Hombros', 'Brazos', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas', 'Abdominales'];
  const rirOptions = Array.from({ length: 6 }, (_, i) => i);
  const subjectiveScaleOptions = Array.from({ length: 4 }, (_, i) => i);
  const performanceScoreOptions = Array.from({ length: 5 }, (_, i) => i);
  const painScoreOptions = Array.from({ length: 4 }, (_, i) => i);

  const handleExerciseChange = (index, field, value) => {
    const newExercises = [...exercises];
    newExercises[index][field] = value;
    setExercises(newExercises);
  };

  const handleSetChange = (exerciseIndex, setIndex, field, value) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex].sets[setIndex][field] = value;
    setExercises(newExercises);
  };

  const addSet = (exerciseIndex) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex].sets.push({ reps: '', load: '', rir: '', mindMuscle: '', pump: '', musclePerturbation: '' });
    setExercises(newExercises);
  };

  const removeSet = (exerciseIndex, setIndex) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex].sets.splice(setIndex, 1);
    setExercises(newExercises);
  };

  const addExercise = () => {
    setExercises([
      ...exercises,
      {
        name: '',
        muscleGroup: '',
        sets: [{ reps: '', load: '', rir: '', mindMuscle: '', pump: '', musclePerturbation: '' }],
        performanceScore: '',
        painScore: '',
        notes: '',
        showSubjectiveMetrics: false
      }
    ]);
  };

  const removeExercise = (index) => {
    const newExercises = [...exercises];
    newExercises.splice(index, 1);
    setExercises(newExercises);
  };

  const toggleSubjectiveMetrics = (exerciseIndex) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex].showSubjectiveMetrics = !newExercises[exerciseIndex].showSubjectiveMetrics;
    setExercises(newExercises);
  };

  const getProgressionRecommendation = (currentExercise, allTrainingLogs, userPriorityMuscles) => {
    const { name, muscleGroup, performanceScore, painScore } = currentExercise;

    const isPrioritized = Object.values(userPriorityMuscles || {}).flat().includes(muscleGroup);

    if (!isPrioritized) {
      return `Este es un músculo no prioritario. Monitorea tu "fuerza de repeticiones" a largo plazo para asegurar que el volumen de mantenimiento sea adecuado.`;
    }

    const perfScore = parseInt(performanceScore);
    const painScoreVal = parseInt(painScore);

    if (isNaN(perfScore) || isNaN(painScoreVal)) {
      return "Por favor, ingresa las puntuaciones de rendimiento y dolor para una recomendación.";
    }

    if (perfScore <= 1 && painScoreVal <= 1) {
      return `¡Excelente progreso en ${muscleGroup}! Para tu próxima sesión equivalente, considera **añadir 1-2 series** o aumentar ligeramente la carga/repeticiones.`;
    } else if (perfScore <= 2 && painScoreVal <= 2) {
      return `Buen rendimiento en ${muscleGroup}. Para tu próxima sesión equivalente, te recomiendo **mantener el volumen actual**. Enfócate en la técnica y el esfuerzo.`;
    } else if (perfScore >= 3 || painScoreVal >= 3) {
      return `¡Atención, Coach Alex! Parece que has alcanzado tu VMR para ${muscleGroup}. Tu rendimiento disminuyó o la recuperación es insuficiente. Necesitas una estrategia de gestión de fatiga.`;
    }
    return "No hay recomendación disponible con los datos actuales.";
  };

  const generateSessionInsight = async (sessionLog) => {
    setIsGeneratingInsight(true);
    setModalMessage("Generando análisis de sesión con IA... Esto puede tardar unos segundos.");
    setShowModal(true);

    const exerciseDetails = sessionLog.exercises.map(ex => {
      const totalReps = ex.sets.reduce((sum, s) => sum + parseInt(s.reps || 0), 0);
      const totalLoad = ex.sets.reduce((sum, s) => sum + parseFloat(s.load || 0), 0);
      const avgReps = ex.sets.length > 0 ? (totalReps / ex.sets.length).toFixed(1) : 0;
      const avgLoad = ex.sets.length > 0 ? (totalLoad / ex.sets.length).toFixed(1) : 0;
      const avgRir = ex.sets.length > 0 ? (ex.sets.reduce((sum, s) => sum + parseInt(s.rir || 0), 0) / ex.sets.length).toFixed(1) : 0;

      return `
        - ${ex.name} (${ex.muscleGroup}): ${ex.sets.length} series.
          Reps/Carga/RIR promedio: ${avgReps}/${avgLoad}kg/${avgRir}.
          Mente-Músculo: ${ex.sets[0]?.mindMuscle || 'N/A'}, Bombeo: ${ex.sets[0]?.pump || 'N/A'}, Perturbación Muscular: ${ex.sets[0]?.musclePerturbation || 'N/A'}.
          Puntuación Rendimiento: ${ex.performanceScore || 'N/A'}, Dolor: ${ex.painScore || 'N/A'}.
          Notas: ${ex.notes || 'Ninguna.'}
      `.trim();
    }).join('\n');

    const prompt = `Eres un coach experto en hipertrofia de Renaissance Periodization. Analiza la siguiente sesión de entrenamiento y proporciona una reflexión concisa y accionable, destacando los puntos clave y sugiriendo un enfoque para la próxima sesión equivalente. Usa un tono motivador y profesional.

Detalles de la sesión:
Fecha: ${sessionLog.date}
${exerciseDetails}

Por favor, enfócate en la progresión y la gestión de la fatiga según los principios de RP.`;

    try {
      // Importante: No exponer tu API Key de Gemini directamente en el frontend en producción.
      // Aquí se usaría una Cloud Function de Firebase o un backend seguro.
      const GEMINI_API_KEY = "TU_API_KEY_DE_GEMINI_AQUI"; // <--- ¡REEMPLAZA ESTO CON TU CLAVE DE API DE GEMINI REAL!
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const aiResponseText = result.candidates[0].content.parts[0].text;
        setModalMessage(`**Análisis de Sesión por IA:**\n\n${aiResponseText}`);
      } else {
        setModalMessage("Error al generar el análisis de sesión. Estructura de respuesta inesperada.");
        console.error("Unexpected AI response structure:", result);
      }
    } catch (error) {
      setModalMessage(`Error al conectar con la IA: ${error.message}. Por favor, inténtalo de nuevo.`);
      console.error("Error calling Gemini API for session insight:", error);
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const generateExerciseSuggestions = async () => {
    if (!exerciseToSuggest.trim()) {
      setModalMessage("Por favor, ingresa un músculo o ejercicio para obtener sugerencias.");
      setShowModal(true);
      return;
    }

    setIsGeneratingSuggestions(true);
    setModalMessage(`Generando sugerencias de ejercicios alternativos para "${exerciseToSuggest}" con IA...`);
    setShowModal(true);

    const prompt = `Eres un coach experto en hipertrofia de Renaissance Periodization. Basado en los principios de especificidad, rango de movimiento completo y conexión mente-músculo, sugiere 3-5 ejercicios alternativos para ${exerciseToSuggest}. Para cada sugerencia, explica brevemente por qué es una buena alternativa y qué músculo(s) trabaja principalmente. Asegúrate de que las alternativas sean para hipertrofia y que no sean el mismo ejercicio que se solicitó.`;

    try {
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      // Importante: No exponer tu API Key de Gemini directamente en el frontend en producción.
      // Aquí se usaría una Cloud Function de Firebase o un backend seguro.
      const GEMINI_API_KEY = "TU_API_KEY_DE_GEMINI_AQUI"; // <--- ¡REEMPLAZA ESTO CON TU CLAVE DE API DE GEMINI REAL!
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const aiResponseText = result.candidates[0].content.parts[0].text;
        setModalMessage(`**Sugerencias de Ejercicios Alternativos para "${exerciseToSuggest}":**\n\n${aiResponseText}`);
      } else {
        setModalMessage("Error al generar sugerencias de ejercicios. Estructura de respuesta inesperada.");
        console.error("Unexpected AI response structure for suggestions:", result);
      }
    } catch (error) {
      setModalMessage(`Error al conectar con la IA para sugerencias: ${error.message}. Por favor, inténtalo de nuevo.`);
      console.error("Error calling Gemini API for exercise suggestions:", error);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();

    if (exercises.some(ex => !ex.name || !ex.muscleGroup || ex.sets.some(s => !s.reps || !s.load))) {
      setModalMessage("Por favor, completa todos los campos obligatorios (nombre de ejercicio, grupo muscular, repeticiones y carga por serie).");
      setShowModal(true);
      return;
    }

    const newLog = {
      date: date,
      exercises: exercises.map(ex => ({
        ...ex,
        sets: ex.sets.map(s => ({
          reps: parseInt(s.reps),
          load: parseFloat(s.load),
          rir: parseInt(s.rir),
          mindMuscle: parseInt(s.mindMuscle),
          pump: parseInt(s.pump),
          musclePerturbation: parseInt(s.musclePerturbation),
          estimated1RM: calculate1RM(parseFloat(s.load), parseInt(s.reps))
        }))
      }))
    };

    await onAddTrainingLog(newLog);

    const lastLoggedExercise = newLog.exercises[newLog.exercises.length - 1];
    const recommendation = getProgressionRecommendation(lastLoggedExercise, trainingLogs, userProfile?.priorityMuscles);
    setModalMessage(`¡Registro de entrenamiento guardado! \n\n**Recomendación para ${lastLoggedExercise.muscleGroup}:** \n${recommendation}`);
    setShowModal(true);

    setDate(new Date().toISOString().split('T')[0]);
    setExercises([
      {
        name: '',
        muscleGroup: '',
        sets: [{ reps: '', load: '', rir: '', mindMuscle: '', pump: '', musclePerturbation: '' }],
        performanceScore: '',
        painScore: '',
        notes: '',
        showSubjectiveMetrics: false
      }
    ]);
  };

  return (
    <div className="p-4 md:p-8 bg-gray-100 min-h-screen md:pl-64">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-3">Registrar Entrenamiento</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-4 rounded-lg shadow-md">
          <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Fecha de la Sesión:</label>
          <input
            type="date"
            id="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            required
          />
        </div>

        {exercises.map((exercise, exerciseIndex) => (
          <div key={exerciseIndex} className="bg-white p-4 rounded-lg shadow-md relative">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Ejercicio {exerciseIndex + 1}</h3>
              {exercises.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeExercise(exerciseIndex)}
                  className="text-gray-500 hover:text-red-500 transition-colors duration-200"
                  aria-label="Eliminar ejercicio"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor={`exercise-name-${exerciseIndex}`} className="block text-sm font-medium text-gray-700 mb-1">Nombre del Ejercicio:</label>
                <input
                  type="text"
                  id={`exercise-name-${exerciseIndex}`}
                  value={exercise.name}
                  onChange={(e) => handleExerciseChange(exerciseIndex, 'name', e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Ej. Press de Banca"
                  required
                />
              </div>
              <div>
                <label htmlFor={`muscle-group-${exerciseIndex}`} className="block text-sm font-medium text-gray-700 mb-1">Grupo Muscular Principal:</label>
                <select
                  id={`muscle-group-${exerciseIndex}`}
                  value={exercise.muscleGroup}
                  onChange={(e) => handleExerciseChange(exerciseIndex, 'muscleGroup', e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                >
                  <option value="">Selecciona</option>
                  {muscleGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-md font-semibold text-gray-700 mb-2">Series:</h4>
              <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-600 mb-2">
                <div>Carga (kg)</div>
                <div>Reps</div>
                <div>RIR</div>
              </div>
              {exercise.sets.map((set, setIndex) => (
                <div key={setIndex} className="grid grid-cols-3 gap-2 items-center mb-2">
                  <input
                    type="number"
                    value={set.load}
                    onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'load', e.target.value)}
                    className="block w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm"
                    min="0"
                    step="0.5"
                    required
                  />
                  <input
                    type="number"
                    value={set.reps}
                    onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'reps', e.target.value)}
                    className="block w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm"
                    min="0"
                    required
                  />
                  <div className="flex items-center">
                    <select
                      value={set.rir}
                      onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'rir', e.target.value)}
                      className="block w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm"
                    >
                      <option value="">-</option>
                      {rirOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    {exercise.sets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSet(exerciseIndex, setIndex)}
                        className="ml-2 text-red-500 hover:text-red-700 text-lg"
                        aria-label="Eliminar serie"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addSet(exerciseIndex)}
                className="mt-3 flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                <PlusCircle className="w-4 h-4 mr-1" /> Añadir Serie
              </button>
            </div>

            <div className="mt-6 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => toggleSubjectiveMetrics(exerciseIndex)}
                className="flex items-center text-gray-700 hover:text-gray-900 font-medium text-sm mb-3"
              >
                Métricas Subjetivas y Puntuaciones
                {exercise.showSubjectiveMetrics ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
              </button>

              {exercise.showSubjectiveMetrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor={`mind-muscle-${exerciseIndex}`} className="block text-sm font-medium text-gray-700 mb-1">Mente-Músculo (0-3):</label>
                    <select
                      id={`mind-muscle-${exerciseIndex}`}
                      value={exercise.sets[0]?.mindMuscle || ''}
                      onChange={(e) => handleSetChange(exerciseIndex, 0, 'mindMuscle', e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">-</option>
                      {subjectiveScaleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`pump-${exerciseIndex}`} className="block text-sm font-medium text-gray-700 mb-1">Bombeo (0-3):</label>
                    <select
                      id={`pump-${exerciseIndex}`}
                      value={exercise.sets[0]?.pump || ''}
                      onChange={(e) => handleSetChange(exerciseIndex, 0, 'pump', e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">-</option>
                      {subjectiveScaleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`performance-score-${exerciseIndex}`} className="block text-sm font-medium text-gray-700 mb-1">Puntuación de Rendimiento (0-4):</label>
                    <select
                      id={`performance-score-${exerciseIndex}`}
                      value={exercise.performanceScore}
                      onChange={(e) => handleExerciseChange(exerciseIndex, 'performanceScore', e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">-</option>
                      {performanceScoreOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      0=Mucho mejor, 1=Un poco mejor, 2=Igual, 3=Un poco peor, 4=Mucho peor.
                    </p>
                  </div>
                  <div>
                    <label htmlFor={`pain-score-${exerciseIndex}`} className="block text-sm font-medium text-gray-700 mb-1">Puntuación de Dolor Muscular (0-3):</label>
                    <select
                      id={`pain-score-${exerciseIndex}`}
                      value={exercise.painScore}
                      onChange={(e) => handleExerciseChange(exerciseIndex, 'painScore', e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">-</option>
                      {painScoreOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      0=Nada de dolor, 1=Ligero, 2=Moderado, 3=Mucho dolor/no recuperado.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4">
              <label htmlFor={`notes-${exerciseIndex}`} className="block text-sm font-medium text-gray-700 mb-1">Notas Adicionales:</label>
              <textarea
                id={`notes-${exerciseIndex}`}
                value={exercise.notes}
                onChange={(e) => handleExerciseChange(exerciseIndex, 'notes', e.target.value)}
                rows="2"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Observaciones técnicas, sensaciones, etc."
              ></textarea>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addExercise}
          className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-300"
        >
          <PlusCircle className="w-5 h-5 mr-2" /> Añadir Otro Ejercicio
        </button>

        <button
          type="submit"
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-300 mt-8"
        >
          Guardar Sesión de Entrenamiento
        </button>
        {/* AI Insight Button */}
        {trainingLogs.length > 0 && (
          <button
            type="button"
            onClick={() => generateSessionInsight(trainingLogs[trainingLogs.length - 1])}
            disabled={isGeneratingInsight}
            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition duration-300 mt-4"
          >
            {isGeneratingInsight ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generando Análisis...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                ✨ Generar Análisis de Sesión con IA
              </>
            )}
          </button>
        )}

        {/* New AI Exercise Suggestion Section */}
        <div className="mt-8 p-6 bg-blue-50 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
            <RefreshCcw className="w-6 h-6 mr-2" /> ✨ Sugerencias de Ejercicios Alternativos
          </h2>
          <p className="text-blue-700 mb-4">
            ¿Buscas variar tu entrenamiento o necesitas alternativas para un músculo específico?
            Ingresa un músculo (ej. "Pecho") o un ejercicio (ej. "Press de Banca") y la IA te sugerirá opciones.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={exerciseToSuggest}
              onChange={(e) => setExerciseToSuggest(e.target.value)}
              placeholder="Ej. Hombros o Sentadilla"
              className="flex-grow px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            <button
              type="button"
              onClick={generateExerciseSuggestions}
              disabled={isGeneratingSuggestions}
              className="flex-shrink-0 flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-300"
            >
              {isGeneratingSuggestions ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Sugerir Ejercicios
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

const DashboardPage = ({ userProfile, trainingLogs }) => {
  const weeklyVolumeData = calculateWeeklyVolume(trainingLogs);
  const latestLog = trainingLogs.length > 0 ? trainingLogs[trainingLogs.length - 1] : null;

  const getFatigueManagementSuggestion = (log) => {
    if (!log) return "Registra tu primer entrenamiento para obtener sugerencias de fatiga.";

    let fatigueDetected = false;
    let muscleFatigue = [];

    log.exercises.forEach(exercise => {
      const perfScore = parseInt(exercise.performanceScore);
      const painScore = parseInt(exercise.painScore);

      if (perfScore >= 3 || painScore >= 3) {
        fatigueDetected = true;
        muscleFatigue.push(exercise.muscleGroup);
      }
    });

    if (fatigueDetected) {
      if (muscleFatigue.length > 1) {
        return `¡Fatiga generalizada detectada en ${muscleFatigue.join(', ')}! Considera una **descarga (deload)** la próxima semana, reduciendo volumen y carga.`;
      } else {
        return `Fatiga localizada detectada en ${muscleFatigue[0]}. Podrías intentar una **sesión de recuperación** (entrenamiento al VM) para este músculo antes de tu próxima sesión pesada.`;
      }
    }
    return "¡Vas por buen camino! No se detectó fatiga excesiva en tu última sesión.";
  };

  const fatigueSuggestion = getFatigueManagementSuggestion(latestLog);

  const latestRecommendations = {};
  if (latestLog && userProfile?.priorityMuscles) {
    latestLog.exercises.forEach(exercise => {
      const isPrioritized = Object.values(userProfile.priorityMuscles).flat().includes(exercise.muscleGroup);
      if (isPrioritized) {
        const perfScore = parseInt(exercise.performanceScore);
        const painScore = parseInt(exercise.painScore);

        if (!isNaN(perfScore) && !isNaN(painScore)) {
          if (perfScore <= 1 && painScore <= 1) {
            latestRecommendations[exercise.muscleGroup] = `¡Excelente! Añade 1-2 series.`;
          } else if (perfScore <= 2 && painScore <= 2) {
            latestRecommendations[exercise.muscleGroup] = `Mantén el volumen actual.`;
          } else if (perfScore >= 3 || painScore >= 3) {
            latestRecommendations[exercise.muscleGroup] = `¡VMR alcanzado! Necesitas gestionar la fatiga.`;
          }
        }
      }
    });
  }

  const allMuscleGroupsInLogs = [...new Set(trainingLogs.flatMap(log => log.exercises.map(ex => ex.muscleGroup)))];

  return (
    <div className="p-4 md:p-8 bg-gray-100 min-h-screen md:pl-64">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-3">Dashboard de Hipertrofia</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2 text-blue-600" /> Tu Perfil
          </h2>
          {userProfile ? (
            <div className="space-y-2 text-gray-700">
              <p><span className="font-medium">Objetivos:</span> {userProfile.objectives || 'No definidos'}</p>
              <p><span className="font-medium">Músculos Prioritarios (Max):</span> {userProfile.priorityMuscles?.max.join(', ') || 'No definidos'}</p>
              <p><span className="font-medium">VME Inicial (Ej.):</span> {userProfile.initialVME && Object.keys(userProfile.initialVME).length > 0 ? JSON.stringify(userProfile.initialVME) : 'No definidos'}</p>
              <p><span className="font-medium">ID de Usuario:</span> <span className="text-sm break-all">{userProfile.userId}</span></p>
            </div>
          ) : (
            <p className="text-gray-600">Por favor, configura tu perfil en la sección de Ajustes.</p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-green-600" /> Últimas Recomendaciones
          </h2>
          {Object.keys(latestRecommendations).length > 0 ? (
            <div className="space-y-2 text-gray-700">
              {Object.entries(latestRecommendations).map(([muscle, rec]) => (
                <p key={muscle}><span className="font-medium">{muscle}:</span> {rec}</p>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">Registra entrenamientos para obtener recomendaciones personalizadas.</p>
          )}
          <div className="mt-4 p-3 bg-blue-50 rounded-md text-blue-800 text-sm">
            <p className="font-semibold">Gestión de Fatiga:</p>
            <p>{fatigueSuggestion}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Volumen Semanal por Grupo Muscular</h2>
        {weeklyVolumeData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyVolumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="week" tick={{ fill: '#4a5568', fontSize: 12 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}
                labelStyle={{ color: '#2d3748', fontWeight: 'bold' }}
                itemStyle={{ color: '#2d3748' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              {allMuscleGroupsInLogs.map((muscle, index) => (
                <Bar key={muscle} dataKey={muscle} stackId="a" fill={`hsl(${index * 60}, 70%, 50%)`} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-600">Registra entrenamientos para ver tu volumen semanal.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Progreso de 1RM Estimado (Últimos 10 Registros)</h2>
        {trainingLogs.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={trainingLogs.slice(-10).flatMap(log =>
                log.exercises.flatMap(ex =>
                  ex.sets.map(set => ({
                    date: log.date,
                    exercise: ex.name,
                    estimated1RM: set.estimated1RM
                  }))
                )
              )}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="date" tickFormatter={(dateStr) => new Date(dateStr).toLocaleDateString()} tick={{ fill: '#4a5568', fontSize: 12 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 12 }} />
              <Tooltip
                formatter={(value, name, props) => [`${value} kg`, props.payload.exercise]}
                labelFormatter={(label) => `Fecha: ${new Date(label).toLocaleDateString()}`}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}
                labelStyle={{ color: '#2d3748', fontWeight: 'bold' }}
                itemStyle={{ color: '#2d3748' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Line type="monotone" dataKey="estimated1RM" stroke="#8884d8" name="1RM Estimado" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-600">Registra entrenamientos para ver el progreso de tu 1RM estimado.</p>
        )}
      </div>
    </div>
  );
};


// --- Main App Component ---
const App = () => {
  const { db, userId, isAuthReady } = useFirebase();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [userProfile, setUserProfile] = useState(null);
  const [trainingLogs, setTrainingLogs] = useState([]);
  const [showLoading, setShowLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  useEffect(() => {
    let unsubscribe;
    if (db && userId && isAuthReady) {
      const userProfileRef = doc(db, `artifacts/${APP_ID}/users/${userId}/profile`, 'userProfile'); // Usando APP_ID
      unsubscribe = onSnapshot(userProfileRef, (docSnap) => {
        if (docSnap.exists()) {
          setUserProfile({ ...docSnap.data(), userId: userId });
        } else {
          setUserProfile({ userId: userId });
        }
        setShowLoading(false);
      }, (error) => {
        console.error("Error fetching user profile:", error);
        setShowLoading(false);
      });
    } else if (isAuthReady) {
      setShowLoading(false);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [db, userId, isAuthReady]);

  useEffect(() => {
    let unsubscribe;
    if (db && userId && isAuthReady) {
      const trainingLogsCollectionRef = collection(db, `artifacts/${APP_ID}/users/${userId}/trainingLogs`); // Usando APP_ID
      const q = query(trainingLogsCollectionRef);
      unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        logs.sort((a, b) => new Date(a.date) - new Date(b.date));
        setTrainingLogs(logs);
      }, (error) => {
        console.error("Error fetching training logs:", error);
      });
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [db, userId, isAuthReady]);

  const handleSaveSettings = async (settings) => {
    if (db && userId) {
      try {
        const userProfileRef = doc(db, `artifacts/${APP_ID}/users/${userId}/profile`, 'userProfile'); // Usando APP_ID
        await setDoc(userProfileRef, settings, { merge: true });
        console.log("Profile settings saved successfully!");
        setModalMessage("Configuración guardada con éxito.");
        setShowModal(true);
      } catch (e) {
        console.error("Error saving profile settings: ", e);
        setModalMessage("Error al guardar la configuración.");
        setShowModal(true);
      }
    } else {
      console.warn("Firestore or User ID not available yet.");
      setModalMessage("Error: No se pudo guardar la configuración. Firestore o ID de usuario no disponibles.");
      setShowModal(true);
    }
  };

  const handleAddTrainingLog = async (newLog) => {
    if (db && userId) {
      try {
        const trainingLogsCollectionRef = collection(db, `artifacts/${APP_ID}/users/${userId}/trainingLogs`); // Usando APP_ID
        await addDoc(trainingLogsCollectionRef, newLog);
        console.log("Training log added successfully!");
      } catch (e) {
        console.error("Error adding training log: ", e);
        setModalMessage("Error al añadir el registro de entrenamiento.");
        setShowModal(true);
      }
    } else {
      console.warn("Firestore or User ID not available yet.");
      setModalMessage("Error: No se pudo añadir el registro de entrenamiento. Firestore o ID de usuario no disponibles.");
      setShowModal(true);
    }
  };

  if (showLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-blue-600 text-xl font-semibold">Cargando dashboard...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen font-inter bg-gray-100">
      <header className="bg-gray-800 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold">Coach Alex - Hipertrofia RP</h1>
        <div className="text-sm md:text-base">
          ID de Usuario: <span className="font-mono text-gray-400 break-all">{userId}</span>
        </div>
      </header>

      <main className="flex-grow">
        {currentPage === 'dashboard' && <DashboardPage userProfile={userProfile} trainingLogs={trainingLogs} />}
        {currentPage === 'log-training' && <LogTrainingPage onAddTrainingLog={handleAddTrainingLog} trainingLogs={trainingLogs} userProfile={userProfile} setShowModal={setShowModal} setModalMessage={setModalMessage} />}
        {currentPage === 'settings' && <SettingsPage userProfile={userProfile} onSaveSettings={handleSaveSettings} setShowModal={setShowModal} setModalMessage={setModalMessage} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 shadow-lg md:hidden z-40">
        <div className="flex justify-around items-center h-16">
          <button
            onClick={() => setCurrentPage('dashboard')}
            className={`flex flex-col items-center text-sm font-medium px-2 py-1 rounded-md transition-colors duration-200 ${currentPage === 'dashboard' ? 'text-blue-400 bg-gray-700' : 'text-gray-300 hover:text-blue-400'}`}
          >
            <Home className="w-6 h-6 mb-1" />
            Dashboard
          </button>
          <button
            onClick={() => setCurrentPage('log-training')}
            className={`flex flex-col items-center text-sm font-medium px-2 py-1 rounded-md transition-colors duration-200 ${currentPage === 'log-training' ? 'text-blue-400 bg-gray-700' : 'text-gray-300 hover:text-blue-400'}`}
          >
            <ClipboardList className="w-6 h-6 mb-1" />
            Registrar
          </button>
          <button
            onClick={() => setCurrentPage('settings')}
            className={`flex flex-col items-center text-sm font-medium px-2 py-1 rounded-md transition-colors duration-200 ${currentPage === 'settings' ? 'text-blue-400 bg-gray-700' : 'text-gray-300 hover:text-blue-400'}`}
          >
            <Settings className="w-6 h-6 mb-1" />
            Ajustes
          </button>
        </div>
      </nav>

      <nav className="hidden md:flex flex-col w-64 bg-gray-900 border-r border-gray-700 shadow-lg fixed inset-y-0 left-0 z-40 p-4">
        <div className="flex flex-col space-y-2 mt-8">
          <button
            onClick={() => setCurrentPage('dashboard')}
            className={`flex items-center px-4 py-2 rounded-lg text-lg font-medium transition-colors duration-200 ${currentPage === 'dashboard' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-200 hover:bg-gray-700'}`}
          >
            <Home className="w-6 h-6 mr-3" />
            Dashboard
          </button>
          <button
            onClick={() => setCurrentPage('log-training')}
            className={`flex items-center px-4 py-2 rounded-lg text-lg font-medium transition-colors duration-200 ${currentPage === 'log-training' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-200 hover:bg-gray-700'}`}
          >
            <ClipboardList className="w-6 h-6 mr-3" />
            Registrar Entrenamiento
          </button>
          <button
            onClick={() => setCurrentPage('settings')}
            className={`flex items-center px-4 py-2 rounded-lg text-lg font-medium transition-colors duration-200 ${currentPage === 'settings' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-200 hover:bg-gray-700'}`}
          >
            <Settings className="w-6 h-6 mr-3" />
            Ajustes del Perfil
          </button>
        </div>
      </nav>

      <Modal show={showModal} onClose={() => setShowModal(false)} title="Notificación">
        <div dangerouslySetInnerHTML={{ __html: modalMessage.replace(/\n/g, '<br/>') }} />
      </Modal>
    </div>
  );
};

const Root = () => (
  <FirebaseProvider>
    <App />
  </FirebaseProvider>
);

export default Root;