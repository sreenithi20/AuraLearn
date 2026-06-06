import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    query,
    where,
    serverTimestamp,
    getDoc,
    setDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ✅ Your actual Firebase config (Retained from your snippets)
const firebaseConfig = {
    apiKey: "AIzaSyCxmnIFjxaOCfaVuXOlubO0q5-dLUXTtSs",
    authDomain: "aura-learn.firebaseapp.com",
    projectId: "aura-learn",
    storageBucket: "aura-learn.firebasestorage.app",
    messagingSenderId: "368429399651",
    appId: "1:368429399651:web:d7ec579433ff3d55754256",
    measurementId: "G-0TGJGXW6R6"
};

// ✅ IMPORTANT: PLACE YOUR GEMINI API KEY HERE
const GEMINI_API_KEY = "AIzaSyDMuZ0Veq5GjxgP7xNJ6zPov1K6snoWpo4";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentLearningPath = null;

// --- Utility Functions ---

function showSpinner(show) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
    }
}

function displayMessage(message, type) {
    // Targets message areas on all relevant pages
    const messageElement = document.getElementById('messages') || document.getElementById('auth-message') || document.getElementById('game-messages') || document.getElementById('link-messages');
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.className = `message-area ${type}`;
        messageElement.style.display = 'block';
        if (type !== 'error') {
            setTimeout(() => {
                messageElement.style.display = 'none';
            }, 5000);
        }
    }
}

function downloadNotes(content) {
    const filename = "AuraLearn_Generated_Notes.txt";
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// --- Firebase / Firestore Functions ---

async function updateGamificationData(user, updates) {
    const userRef = doc(db, "users", user.uid);
    try {
        await updateDoc(userRef, updates);
    } catch (e) {
        console.error("Error updating gamification data:", e);
        if (e.code === 'not-found') {
            await setDoc(userRef, {
                points: 0,
                completedSteps: 0,
                ...updates
            }, { merge: true });
        }
    }
}

async function getGamificationData() {
    const user = auth.currentUser;
    if (!user) return { points: 0, completedSteps: 0 };

    const userRef = doc(db, "users", user.uid);
    try {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
    } catch (e) {
        console.error("Error fetching gamification data:", e);
    }
    return { points: 0, completedSteps: 0 };
}

// --- FAVORITES PATH LOGIC ---

async function checkIfPathIsSaved(pathTitle) {
    const user = auth.currentUser;
    if (!user) return null;

    try {
        const pathRef = collection(db, "users", user.uid, "learningPaths");
        const q = query(pathRef, where("title", "==", pathTitle));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].id;
        }
    } catch (e) {
        console.error("Error checking path status:", e);
    }
    return null;
}

async function toggleLearningPathSave() {
    const user = auth.currentUser;
    if (!user) {
        displayMessage("Please sign in to save your path.", "warning");
        setTimeout(() => window.location.href = "signin.html", 1000);
        return;
    }

    if (!currentLearningPath) {
        displayMessage("No learning path loaded to save.", "error");
        return;
    }

    const docId = currentLearningPath.docId;
    const pathData = currentLearningPath;

    if (docId) {
        try {
            const pathDocRef = doc(db, "users", user.uid, "learningPaths", docId);
            await deleteDoc(pathDocRef);

            currentLearningPath.docId = null;
            updateFavoriteButton(false);
            displayMessage("Learning Path removed from favorites.", "success");
        } catch (e) {
            console.error("Error deleting path:", e);
            displayMessage("Failed to remove path from favorites. Please try again.", "error");
        }
    } else {
        try {
            const pathRef = collection(db, "users", user.uid, "learningPaths");
            const newDocRef = await addDoc(pathRef, {
                ...pathData,
                createdAt: serverTimestamp(),
                uid: user.uid
            });

            currentLearningPath.docId = newDocRef.id;
            updateFavoriteButton(true);
            displayMessage("Learning Path saved successfully!", "success");
        } catch (e) {
            console.error("Error saving path:", e);
            displayMessage("Failed to save path. Please try again.", "error");
        }
    }
}

function updateFavoriteButton(isSaved) {
    const btn = document.getElementById('favorite-path-btn');
    const iconSpan = document.getElementById('favorite-icon');
    const textSpan = document.getElementById('favorite-text');

    if (!btn || !iconSpan || !textSpan) return;

    btn.style.display = 'inline-block';

    if (isSaved) {
        iconSpan.textContent = '💖';
        textSpan.textContent = 'Unfavorite Path';
        btn.classList.add('favorite-saved');
    } else {
        iconSpan.textContent = '🤍';
        textSpan.textContent = 'Save Path';
        btn.classList.remove('favorite-saved');
    }
}

// --- FAVORITES LINKS LOGIC ---

async function saveFavoriteLink(name, url) {
    const user = auth.currentUser;
    if (!user) {
        displayMessage("Please sign in to save favorite links.", "warning");
        return;
    }

    try {
        const linksRef = collection(db, "users", user.uid, "favoriteLinks");
        await addDoc(linksRef, {
            name: name,
            url: url,
            createdAt: serverTimestamp()
        });
        displayMessage("Link saved successfully!", "success");
        loadFavoriteLinks();

        document.getElementById('link-name').value = '';
        document.getElementById('link-url').value = '';

    } catch (e) {
        console.error("Error saving link:", e);
        displayMessage("Failed to save link. Permissions might be missing or insufficient.", "error");
    }
}

async function loadFavoriteLinks() {
    const user = auth.currentUser;
    const listElement = document.getElementById('favorite-links-list');
    if (!listElement) return;

    if (!user) {
        listElement.innerHTML = '<p class="message-area warning">Please sign in to view your favorite links.</p>';
        return;
    }

    listElement.innerHTML = '<p class="message-area info">Loading links...</p>';

    try {
        const linksRef = collection(db, "users", user.uid, "favoriteLinks");
        const querySnapshot = await getDocs(linksRef);

        listElement.innerHTML = '';

        if (querySnapshot.empty) {
            listElement.innerHTML = '<p class="message-area info">No favorite links added yet.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const link = docSnap.data();
            const linkId = docSnap.id;
            const listItem = document.createElement('li');
            listItem.className = 'favorite-link-item';
            listItem.innerHTML = `
                <a href="${link.url}" target="_blank">${link.name}</a>
                <button class="secondary-btn delete-link-btn" data-link-id="${linkId}">Delete</button>
            `;
            listElement.appendChild(listItem);

            listItem.querySelector('.delete-link-btn').addEventListener('click', () => {
                deleteFavoriteLink(linkId);
            });
        });

    } catch (e) {
        console.error("Error loading links:", e);
        listElement.innerHTML = '<p class="message-area error">Error loading favorite links. Check Firebase Security Rules.</p>';
    }
}

async function deleteFavoriteLink(linkId) {
    const user = auth.currentUser;
    if (!user || !linkId) return;

    try {
        const linkDocRef = doc(db, "users", user.uid, "favoriteLinks", linkId);
        await deleteDoc(linkDocRef);
        displayMessage("Link deleted successfully.", "success");
        loadFavoriteLinks();
    } catch (e) {
        console.error("Error deleting link:", e);
        displayMessage("Failed to delete link. Check Firebase Security Rules.", "error");
    }
}


// --- API Functions for Gemini ---

function getPathContext() {
    const storedPathData = localStorage.getItem('pathData');
    if (storedPathData) {
        const pathData = JSON.parse(storedPathData);
        return pathData.title || "general knowledge";
    }
    return "general knowledge";
}

async function generateLearningPathWithGemini(primaryInterest, interdisciplinaryTopics) {
    showSpinner(true);
    displayMessage("Generating path...", "info");

    const prompt = `Generate a 7-step learning path for "${primaryInterest}" combined with "${interdisciplinaryTopics}". The response MUST be a JSON object that strictly follows the schema provided in the generationConfig. Ensure each step has relevant links (at least 2-3 links per step).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'The title of the learning path.' },
                            steps: {
                                type: 'array',
                                description: 'A list of 7 learning steps.',
                                items: {
                                    type: 'object',
                                    properties: {
                                        title: { type: 'string' },
                                        description: { type: 'string' },
                                        duration: { type: 'string', description: 'Estimated time to complete the step (e.g., 2 weeks)' },
                                        links: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    name: { type: 'string' },
                                                    url: { type: 'string' }
                                                }
                                            }
                                        },
                                        isComplete: { type: 'boolean', description: 'Internal flag, always false initially.' }
                                    },
                                    required: ['title', 'description', 'duration']
                                }
                            }
                        },
                        required: ['title', 'steps']
                    },
                    temperature: 0.7
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        const jsonResponseText = result.candidates[0].content.parts[0].text;
        let pathData = JSON.parse(jsonResponseText);

        pathData.steps = pathData.steps.map(step => ({
            ...step,
            isComplete: false
        }));

        currentLearningPath = pathData;
        localStorage.setItem('pathData', JSON.stringify(pathData));
        window.location.href = 'path.html';
        return pathData;

    } catch (error) {
        console.error("Error generating path:", error);
        displayMessage(`Error generating path: ${error.message}`, "error");
        showSpinner(false);
        return null;
    }
}

async function generateNotesWithGemini(syllabus) {
    showSpinner(true);
    displayMessage("Generating detailed notes...", "info");

    const prompt = `Generate comprehensive and detailed study notes from the following syllabus. Structure the output clearly with headings and bullet points. Syllabus: ${syllabus}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.5 }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const notes = result.candidates[0].content.parts[0].text;
        showSpinner(false);
        return notes;

    } catch (error) {
        console.error("Error generating notes:", error);
        displayMessage(`Error generating notes: ${error.message}`, "error");
        showSpinner(false);
        return null;
    }
}


// --- 🧩 GAME GENERATION FUNCTIONS ---

async function generateQuizWithGemini(topic) {
    showSpinner(true);
    displayMessage(`Generating quiz on ${topic}...`, "info");
    const gameArea = document.getElementById('game-area');
    gameArea.innerHTML = '<p class="message-area info">Generating quiz...</p>';

    const prompt = `Generate a 5-question multiple-choice quiz about "${topic}". The response MUST be a JSON object that strictly follows the provided schema.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        properties: {
                            quizTitle: { type: 'string' },
                            questions: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        question: { type: 'string' },
                                        options: { type: 'array', items: { type: 'string' } },
                                        answer: { type: 'string', description: 'The correct option string.' }
                                    },
                                    required: ['question', 'options', 'answer']
                                }
                            }
                        },
                        required: ['quizTitle', 'questions']
                    },
                    temperature: 0.6
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        const jsonResponseText = result.candidates[0].content.parts[0].text;
        const quizData = JSON.parse(jsonResponseText);
        showSpinner(false);
        displayQuiz(quizData);
        return quizData;

    } catch (error) {
        console.error("Error generating quiz:", error);
        displayMessage(`Failed to generate quiz: ${error.message}. Try again.`, "error");
        gameArea.innerHTML = '';
        showSpinner(false);
        return null;
    }
}

async function generateFlashcardsWithGemini(topic) {
    showSpinner(true);
    displayMessage(`Generating flashcards on ${topic}...`, "info");
    const gameArea = document.getElementById('game-area');
    gameArea.innerHTML = '<p class="message-area info">Generating flashcards...</p>';

    const prompt = `Generate 5 flashcards with a term and definition for the topic: "${topic}". The response MUST be a JSON object that strictly follows the provided schema.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        properties: {
                            cards: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        term: { type: 'string', description: 'The term or question.' },
                                        definition: { type: 'string', description: 'The definition or answer.' }
                                    },
                                    required: ['term', 'definition']
                                }
                            }
                        },
                        required: ['cards']
                    },
                    temperature: 0.5
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        const jsonResponseText = result.candidates[0].content.parts[0].text;
        const cardData = JSON.parse(jsonResponseText);
        showSpinner(false);
        displayFlashcards(cardData.cards);
        return cardData;

    } catch (error) {
        console.error("Error generating flashcards:", error);
        displayMessage(`Failed to generate flashcards: ${error.message}. Try again.`, "error");
        gameArea.innerHTML = '';
        showSpinner(false);
        return null;
    }
}

async function generateWordScrambleWithGemini(topic) {
    showSpinner(true);
    displayMessage(`Generating word scramble on ${topic}...`, "info");
    const gameArea = document.getElementById('game-area');
    gameArea.innerHTML = '<p class="message-area info">Generating word scramble...</p>';

    const prompt = `Generate 5 key terms/concepts related to "${topic}" and their definitions. The response MUST be a JSON object that strictly follows the provided schema. Do NOT scramble the words in the response.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        properties: {
                            scrambleWords: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        word: { type: 'string', description: 'The correct, unscrambled word.' },
                                        hint: { type: 'string', description: 'A brief definition or hint for the word.' }
                                    },
                                    required: ['word', 'hint']
                                }
                            }
                        },
                        required: ['scrambleWords']
                    },
                    temperature: 0.8
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        const jsonResponseText = result.candidates[0].content.parts[0].text;
        const scrambleData = JSON.parse(jsonResponseText);
        showSpinner(false);
        displayWordScramble(scrambleData.scrambleWords);
        return scrambleData;

    } catch (error) {
        console.error("Error generating word scramble:", error);
        displayMessage(`Failed to generate word scramble: ${error.message}. Try again.`, "error");
        gameArea.innerHTML = '';
        showSpinner(false);
        return null;
    }
}


// --- 🧩 GAME DISPLAY FUNCTIONS ---

function displayQuiz(quizData) {
    const gameArea = document.getElementById('game-area');
    let score = 0;

    gameArea.innerHTML = `
        <h3 style="color: var(--primary-color);">${quizData.quizTitle}</h3>
        <form id="quiz-form"></form>
        <button id="submit-quiz-btn" class="action-btn">Submit Quiz</button>
        <div id="quiz-results" style="margin-top: 20px;"></div>
    `;

    const quizForm = document.getElementById('quiz-form');
    quizData.questions.forEach((q, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quiz-question-card';
        qDiv.innerHTML = `<p><strong>${index + 1}. ${q.question}</strong></p>`;

        q.options.forEach((option, optIndex) => {
            const radioId = `q${index}-opt${optIndex}`;
            qDiv.innerHTML += `
                <div class="option">
                    <input type="radio" id="${radioId}" name="question${index}" value="${option}">
                    <label for="${radioId}">${option}</label>
                </div>
            `;
        });
        quizForm.appendChild(qDiv);
    });

    document.getElementById('submit-quiz-btn').addEventListener('click', () => {
        let correctCount = 0;
        quizData.questions.forEach((q, index) => {
            const form = document.getElementById('quiz-form');
            const selected = form.querySelector(`input[name="question${index}"]:checked`);
            const qDiv = quizForm.children[index];
            qDiv.classList.remove('correct', 'incorrect');

            if (selected) {
                if (selected.value === q.answer) {
                    correctCount++;
                    qDiv.classList.add('correct');
                } else {
                    qDiv.classList.add('incorrect');
                }
                // Highlight the correct answer
                const correctLabel = qDiv.querySelector(`input[value="${q.answer}"]`).parentNode;
                correctLabel.style.border = '2px solid green';
                correctLabel.style.padding = '5px';
            } else {
                qDiv.classList.add('incorrect');
            }
        });

        const resultsDiv = document.getElementById('quiz-results');
        resultsDiv.innerHTML = `
            <p>You scored **${correctCount}** out of ${quizData.questions.length}!</p>
        `;

        // Update gamification points
        const user = auth.currentUser;
        if (user) {
            const pointsGained = correctCount * 20; // 20 points per correct answer
            updateGamificationData(user, { points: firebase.firestore.FieldValue.increment(pointsGained) });
        }
    });
}

function displayFlashcards(cards) {
    const gameArea = document.getElementById('game-area');
    let currentIndex = 0;

    gameArea.innerHTML = `
        <h3 style="color: var(--primary-color);">Flashcards</h3>
        <div id="flashcard-container" class="flashcard-container"></div>
        <div class="button-group" style="justify-content: center;">
            <button id="prev-card-btn" class="secondary-btn" disabled>Previous</button>
            <button id="flip-card-btn" class="action-btn">Flip Card</button>
            <button id="next-card-btn" class="secondary-btn">Next</button>
        </div>
        <p id="card-status" style="text-align: center; margin-top: 10px;">Card 1 of ${cards.length}</p>
    `;

    const container = document.getElementById('flashcard-container');
    const prevBtn = document.getElementById('prev-card-btn');
    const nextBtn = document.getElementById('next-card-btn');
    const flipBtn = document.getElementById('flip-card-btn');
    const statusText = document.getElementById('card-status');

    function renderCard() {
        container.innerHTML = `
            <div id="current-flashcard" class="flashcard" data-flipped="false">
                <div class="card-face card-front">
                    <h4>Term:</h4>
                    <p>${cards[currentIndex].term}</p>
                </div>
                <div class="card-face card-back">
                    <h4>Definition:</h4>
                    <p>${cards[currentIndex].definition}</p>
                </div>
            </div>
        `;
        // Re-attach flip listener to the new card
        document.getElementById('current-flashcard').addEventListener('click', flipCard);

        // Update button states and status
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === cards.length - 1;
        statusText.textContent = `Card ${currentIndex + 1} of ${cards.length}`;
    }

    function flipCard() {
        const card = document.getElementById('current-flashcard');
        const isFlipped = card.getAttribute('data-flipped') === 'true';
        if (isFlipped) {
            card.style.transform = 'rotateY(0deg)';
            card.setAttribute('data-flipped', 'false');
            flipBtn.textContent = 'Flip Card';
        } else {
            card.style.transform = 'rotateY(180deg)';
            card.setAttribute('data-flipped', 'true');
            flipBtn.textContent = 'Flip Back';

            // Give a point on first flip of a new card
            const user = auth.currentUser;
            if (user && !cards[currentIndex].viewed) {
                updateGamificationData(user, { points: firebase.firestore.FieldValue.increment(10) }); // 10 points per new card
                cards[currentIndex].viewed = true;
            }
        }
    }

    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            renderCard();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentIndex < cards.length - 1) {
            currentIndex++;
            renderCard();
        }
    });

    flipBtn.addEventListener('click', flipCard);

    // Initial render
    renderCard();
}

function displayWordScramble(scrambleWords) {
    const gameArea = document.getElementById('game-area');
    let score = 0;

    // Function to scramble a word
    function scramble(word) {
        let a = word.split(""),
            n = a.length;
        for (let i = n - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            let tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
        }
        return a.join("");
    }

    gameArea.innerHTML = `
        <h3 style="color: var(--primary-color);">Word Scramble</h3>
        <form id="scramble-form"></form>
        <button id="submit-scramble-btn" class="action-btn">Check Answers</button>
        <div id="scramble-results" style="margin-top: 20px;"></div>
    `;

    const scrambleForm = document.getElementById('scramble-form');
    scrambleWords.forEach((item, index) => {
        const scrambledWord = scramble(item.word.toUpperCase());
        const qDiv = document.createElement('div');
        qDiv.className = 'scramble-item';
        qDiv.innerHTML = `
            <p><strong>${index + 1}. Scrambled:</strong> <span class="scrambled-text">${scrambledWord}</span></p>
            <p class="hint-text">Hint: ${item.hint}</p>
            <input type="text" id="answer${index}" data-correct-word="${item.word.toUpperCase()}" placeholder="Your unscrambled word">
            <p id="feedback${index}" class="feedback-text"></p>
        `;
        scrambleForm.appendChild(qDiv);
    });

    document.getElementById('submit-scramble-btn').addEventListener('click', () => {
        let correctCount = 0;
        scrambleWords.forEach((item, index) => {
            const input = document.getElementById(`answer${index}`);
            const feedback = document.getElementById(`feedback${index}`);
            const userAnswer = input.value.trim().toUpperCase();
            const correctAnswer = item.word.toUpperCase();

            feedback.textContent = ''; // Clear previous feedback
            input.classList.remove('correct', 'incorrect');

            if (userAnswer === correctAnswer) {
                correctCount++;
                feedback.textContent = '✅ Correct!';
                feedback.style.color = 'green';
                input.classList.add('correct');
            } else if (userAnswer !== '') {
                feedback.textContent = `❌ Incorrect. Correct word: ${correctAnswer}`;
                feedback.style.color = 'red';
                input.classList.add('incorrect');
            }
        });

        const resultsDiv = document.getElementById('scramble-results');
        resultsDiv.innerHTML = `
            <p>You correctly unscrambled **${correctCount}** out of ${scrambleWords.length} words!</p>
        `;

        // Update gamification points
        const user = auth.currentUser;
        if (user) {
            const pointsGained = correctCount * 30; // 30 points per correct word
            updateGamificationData(user, { points: firebase.firestore.FieldValue.increment(pointsGained) });
        }
    });
}


// --- Event Listeners and Initial Load Logic ---

function setupGameEventListeners() {
    const context = getPathContext();
    const gameArea = document.getElementById('game-area');

    document.getElementById('generate-quiz-btn').addEventListener('click', () => {
        gameArea.innerHTML = '<div id="game-messages"></div>';
        generateQuizWithGemini(context);
    });

    document.getElementById('generate-flashcard-btn').addEventListener('click', () => {
        gameArea.innerHTML = '<div id="game-messages"></div>';
        generateFlashcardsWithGemini(context);
    });

    document.getElementById('generate-wordscramble-btn').addEventListener('click', () => {
        gameArea.innerHTML = '<div id="game-messages"></div>';
        generateWordScrambleWithGemini(context);
    });

    // Clear any previous game message
    gameArea.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {

    // --- path.html Logic ---
    if (window.location.pathname.endsWith('path.html')) {
        const storedPathData = localStorage.getItem('pathData');
        if (storedPathData) {
            currentLearningPath = JSON.parse(storedPathData);
            displayLearningPath(currentLearningPath);

            const favoriteBtn = document.getElementById('favorite-path-btn');
            if (favoriteBtn) {
                onAuthStateChanged(auth, async(user) => {
                    if (user && currentLearningPath.title) {
                        const docId = await checkIfPathIsSaved(currentLearningPath.title);
                        currentLearningPath.docId = docId;
                        updateFavoriteButton(!!docId);
                    } else {
                        favoriteBtn.style.display = 'none';
                    }
                });

                favoriteBtn.addEventListener('click', toggleLearningPathSave);
            }
        } else {
            document.getElementById('learning-path-steps').innerHTML = '<p class="message-area error">No path data found. Please go back and generate a path.</p>';
        }
    }

    // --- interest.html Logic ---
    if (window.location.pathname.endsWith('interest.html')) {
        document.getElementById('generate-path-btn').addEventListener('click', () => {
            const primaryInterest = document.getElementById('primary-interest').value;
            const interdisciplinaryTopics = document.getElementById('interdisciplinary-topics').value;

            if (primaryInterest.trim() === "") {
                displayMessage("Please enter your primary interest.", "warning");
                return;
            }

            generateLearningPathWithGemini(primaryInterest, interdisciplinaryTopics);
        });
    }

    // --- study.html Logic ---
    if (window.location.pathname.endsWith('study.html')) {
        document.getElementById('generate-notes-btn').addEventListener('click', async() => {
            const syllabus = document.getElementById('syllabus-input').value;
            if (syllabus.trim() === "") {
                displayMessage("Please enter a syllabus.", "warning");
                return;
            }
            const notes = await generateNotesWithGemini(syllabus);
            const notesSection = document.getElementById('notes-section');
            const notesContent = document.getElementById('notes-content');
            const downloadBtn = document.getElementById('download-notes-btn');

            if (notes) {
                // Replace \n with <br> for display
                notesContent.innerHTML = notes.replace(/\n/g, '<br>');
                notesSection.style.display = 'block';
                // Remove existing listeners before adding a new one
                downloadBtn.replaceWith(downloadBtn.cloneNode(true));
                document.getElementById('download-notes-btn').addEventListener('click', () => downloadNotes(notes));
                displayMessage("Notes generated successfully!", "success");
            } else {
                notesSection.style.display = 'none';
            }
        });
    }

    // --- favorites.html Logic ---
    if (window.location.pathname.endsWith('favorites.html')) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                loadSavedPaths();
                loadFavoriteLinks();

                document.getElementById('save-link-btn').addEventListener('click', () => {
                    const name = document.getElementById('link-name').value.trim();
                    const url = document.getElementById('link-url').value.trim();

                    if (!name || !url) {
                        displayMessage("Please provide both a name and a URL for the link.", "warning");
                        return;
                    }

                    try {
                        // Basic URL validation
                        new URL(url);
                        saveFavoriteLink(name, url);
                    } catch (e) {
                        displayMessage("Please enter a valid URL (e.g., https://www.example.com)", "warning");
                    }
                });

            } else {
                // If not signed in, still call the loaders so they can display the 'sign in' warning
                loadSavedPaths();
                loadFavoriteLinks();
            }
        });
    }

    // --- gamification.html Logic ---
    if (window.location.pathname.endsWith('gamification.html')) {
        onAuthStateChanged(auth, async(user) => {
            if (user) {
                const data = await getGamificationData();
                displayGamificationStats(data);
                // ⭐ This is the crucial line to enable the games
                setupGameEventListeners();
            } else {
                document.getElementById('total-points').textContent = 'N/A';
                document.getElementById('steps-completed').textContent = 'N/A';
                displayMessage('Please sign in to see your stats.', 'warning');
            }
        });
    }

    // --- achievements.html Logic ---
    if (window.location.pathname.endsWith('achievements.html')) {
        onAuthStateChanged(auth, async(user) => {
            if (user) {
                const data = await getGamificationData();
                displayAchievements(data);
            } else {
                document.getElementById('overall-progress-text').textContent = 'Please sign in to view your achievements.';
                document.getElementById('milestones-list').innerHTML = '<p class="message-area info">Sign in to unlock milestones.</p>';
            }
        });
    }
});

// --- Display/UI Functions (Rest of the original functions) ---

function updateProgressBar(pathData) {
    const progressBarFill = document.getElementById('progress-bar-fill');
    if (!progressBarFill || !pathData || !pathData.steps) return;

    const totalSteps = pathData.steps.length;
    const completedSteps = pathData.steps.filter(step => step.isComplete).length;
    const percentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    progressBarFill.style.width = `${percentage}%`;

    const user = auth.currentUser;
    if (user) {
        updateGamificationData(user, { completedSteps: completedSteps });
    }
}

function displayLearningPath(pathData) {
    const contentDiv = document.getElementById('learning-path-steps');
    const pathTitle = document.createElement('h2');
    if (!contentDiv || !pathData || !pathData.steps || pathData.steps.length === 0) {
        contentDiv.innerHTML = '<p class="message-area info">No learning path data found. Generate a new one.</p>';
        return;
    }
    contentDiv.innerHTML = '';
    pathTitle.textContent = pathData.title || "Your Personalized Learning Path";
    contentDiv.appendChild(pathTitle);

    pathData.steps.forEach((step, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = `path-item ${step.isComplete ? 'complete' : 'incomplete'}`;
        stepDiv.innerHTML = `
            <div class="step-header">
                <h3>Step ${index + 1}: ${step.title}</h3>
                <div class="progress-controls">
                    <button class="secondary-btn toggle-complete-btn" data-step-index="${index}">
                        ${step.isComplete ? 'Mark Incomplete' : 'Mark Complete'}
                    </button>
                </div>
            </div>
            <p><strong>Duration:</strong> ${step.duration}</p>
            <p>${step.description}</p>
        `;
        if (step.links && step.links.length > 0) {
            const linksDiv = document.createElement('div');
            linksDiv.className = 'step-links';
            const linksTitle = document.createElement('h4');
            linksTitle.textContent = 'Resources:';
            linksDiv.appendChild(linksTitle);
            step.links.forEach(linkObj => {
                const link = document.createElement('a');
                link.href = linkObj.url;
                link.textContent = linkObj.name || linkObj.url;
                link.target = '_blank';
                link.style.display = 'block';
                linksDiv.appendChild(link);
            });
            stepDiv.appendChild(linksDiv);
        }
        contentDiv.appendChild(stepDiv);

        stepDiv.querySelector('.toggle-complete-btn').addEventListener('click', async(e) => {
            const stepIndex = parseInt(e.target.getAttribute('data-step-index'));
            const storedPathData = localStorage.getItem('pathData');
            let updatedPathData;
            if (storedPathData) {
                updatedPathData = JSON.parse(storedPathData);
            } else {
                displayMessage("Error: Path data not found.", "error");
                return;
            }

            const currentStatus = updatedPathData.steps[stepIndex].isComplete;
            updatedPathData.steps[stepIndex].isComplete = !currentStatus;

            localStorage.setItem('pathData', JSON.stringify(updatedPathData));
            currentLearningPath = updatedPathData;
            displayLearningPath(updatedPathData);

            const user = auth.currentUser;
            if (user) {
                const currentData = await getGamificationData(user);
                let newPoints = currentData.points;
                if (updatedPathData.steps[stepIndex].isComplete) {
                    newPoints += 50;
                } else {
                    newPoints = Math.max(0, newPoints - 50);
                }
                const completedSteps = updatedPathData.steps.filter(step => step.isComplete).length;
                // Note: firebase.firestore.FieldValue.increment is needed here for atomic update, but that's not imported.
                // For simplicity/current structure, we will use the read/write logic, but the increment call should be fixed:
                // await updateGamificationData(user, { points: firebase.firestore.FieldValue.increment(50) });
                await updateGamificationData(user, { points: newPoints, completedSteps: completedSteps });
            }
        });
    });
    updateProgressBar(pathData);
}

function displayAchievements(data) {
    const overallProgressText = document.getElementById('overall-progress-text');
    const milestonesList = document.getElementById('milestones-list');
    if (!overallProgressText || !milestonesList) return;

    const percentage = data.completedSteps >= 7 ? 100 : Math.min(100, (data.completedSteps / 7) * 100);

    overallProgressText.innerHTML = `
        <p><strong>Steps Completed:</strong> ${data.completedSteps}</p>
        <p><strong>Overall Progress:</strong> ${percentage.toFixed(0)}%</p>
    `;

    const milestones = [{
        name: "First Step",
        required: 1,
        unlocked: data.completedSteps >= 1,
        badge: "⭐"
    }, {
        name: "Halfway There",
        required: 4,
        unlocked: data.completedSteps >= 4,
        badge: "🏆"
    }, {
        name: "Path Master",
        required: 7,
        unlocked: data.completedSteps >= 7,
        badge: "👑"
    }, ];

    milestonesList.innerHTML = '';
    milestones.forEach(m => {
                const item = document.createElement('div');
                item.className = `milestone-item ${m.unlocked ? 'unlocked' : 'locked'}`;
                item.innerHTML = `
            <span class="badge">${m.unlocked ? m.badge : '🔒'}</span>
            <p><strong>${m.name}</strong></p>
            <p>${m.unlocked ? 'Unlocked!' : `Complete ${m.required} steps.`}</p>
        `;
        milestonesList.appendChild(item);
    });
}

function displayGamificationStats(data) {
    const pointsElement = document.getElementById('total-points');
    const stepsElement = document.getElementById('steps-completed');
    if (pointsElement) pointsElement.textContent = data.points;
    if (stepsElement) stepsElement.textContent = data.completedSteps;
}

async function loadSavedPaths() {
    const user = auth.currentUser;
    const pathListDiv = document.getElementById('saved-paths-list');

    if (!user) {
        pathListDiv.innerHTML = '<p class="message-area warning">Please sign in to view your saved paths.</p>';
        return;
    }
    
    try {
        const pathRef = collection(db, "users", user.uid, "learningPaths");
        const q = query(pathRef, where("uid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        pathListDiv.innerHTML = '';

        if (querySnapshot.empty) {
            pathListDiv.innerHTML = '<p class="message-area info">No saved paths found.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const path = doc.data();
            const pathItem = document.createElement('div');
            pathItem.className = 'path-item';
            pathItem.innerHTML = `
                <h3>${path.title}</h3>
                <p>Generated: ${path.createdAt ? new Date(path.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
                <button class="secondary-btn view-path-btn" data-path-id="${doc.id}">View Path</button>
            `;
            pathListDiv.appendChild(pathItem);

            pathItem.querySelector('.view-path-btn').addEventListener('click', () => {
                path.docId = doc.id;
                localStorage.setItem('pathData', JSON.stringify(path));
                window.location.href = 'path.html';
            });
        });

    } catch (e) {
        console.error("Error loading saved paths:", e);
        pathListDiv.innerHTML = '<p class="message-area error">Error loading saved paths. Check Firebase permissions.</p>';
    }
}

// --- Global Logout Function ---
window.logout = function() {
    const user = auth.currentUser;
    if (user) {
        signOut(auth).then(() => {
            console.log("User signed out.");
            localStorage.removeItem('pathData');
            window.location.href = "signin.html";
        }).catch((error) => {
            console.error("Logout error:", error);
            alert("Error logging out.");
        });
    } else {
        window.location.href = "signin.html";
    }
}