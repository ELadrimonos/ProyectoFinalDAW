const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const apiRoutes = require('./api');

app.use(express.json());
app.use('/api', apiRoutes);

// Enum de pantallas de juego
const GameScreens = Object.freeze({
    LOBBY: 'lobby',
    START: 'start',
    ANSWER: 'respondiendo',
    VOTING: 'jugando',
    SCOREBOARD: 'puntuaje',
    FINAL_SCREEN: 'fin',
});


const lobbies = [];


http.listen(8080, () => console.log("LISTENING ON 8080"));


io.on('connection', (socket) => {
    // console.log('Usuario conectado:', socket.id);

// Unirse a sala
    socket.on('joinGame', (nombreJug, lobbyCode) => {
        const lobby = getLobby(lobbyCode);

        if (lobby && lobby.players.length < 8) {
            socket.join(lobbyCode);

            let player = {id: socket.id, name: nombreJug, score: 0};
            lobby.players.push(player);
            socket.emit('joinGame', lobby);
            socket.emit('shareGameMode', lobby.game);
            socket.emit('sharePlayer', player);
            socket.emit('updatePlayers', lobby.players);
            io.to(lobbyCode).emit('updatePlayers', lobby.players);
        } else {
            socket.emit('joinError', 'No se puede unir a la sala');
        }
    });

// Crear sala
    socket.on('create', (nombreHost, juego) => {
        let idJuego;
        switch (juego) {
            case 'jokebattle':
                idJuego = 0;
                break;
            case 'chatbot':
                idJuego = 1;
                break;
        }
        const newLobby = {
            id: generateUUID(),
            code: generateRandomCode(),
            players: [],
            game: idJuego,
            data: [],
            round: 1,
            promptsOrder: []
        };
        lobbies.push(newLobby);

        // Aqui es donde realmente se conecta al lobby
        socket.join(newLobby.code);

        let player = {id: socket.id, name: nombreHost, score: 0};
        newLobby.players.push(player);
        socket.emit('lobbyCreated', newLobby);
        socket.emit('joinGame', newLobby);
        socket.emit('sharePlayer', player);
        socket.emit('updatePlayers', newLobby.players);
        io.to(newLobby.code).emit('updatePlayers', newLobby.players);
    });

    // Manejar la desconexión
    socket.on('disconnect', () => {
        const lobby = lobbies.find((l) => l.players.some((p) => p.id === socket.id));

        if (lobby) {

            if (lobby.players[0].id === socket.id) {
                io.to(lobby.code).emit('joinError', 'El host se ha desconectado de la sala');

                closeLobby(lobby.code);
            }

            let disconnectedPlayer = lobby.players.find(p => p.id === socket.id);
            let disconPlayerId = lobby.players.indexOf(disconnectedPlayer)

            lobby.players = lobby.players.filter((p) => p.id !== socket.id);

            socket.leave(lobby.code);
            io.to(lobby.code).emit('disconnectPlayer', disconPlayerId, lobby.players);
            io.to(lobby.code).emit('updatePlayers', lobby.players);
        }


        // console.log('Usuario desconectado:', socket.id);
    });

    socket.on('playerAnswer', (lobbyCode, playerID, answer) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            const playerData = lobby.data.find((d) => d.playerId === playerID);
            if (playerData) {
                playerData.answers.push(answer);
                comprobarNumeroDeRespuestas(lobbyCode);
            } else {
                console.error('No se encontraron datos del jugador con ID:', playerID);
            }
        } else {
            console.error('No se encontró la sala con el código:', lobbyCode);
        }
    });


    socket.on('startGame', async (lobbyCode) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            await crearLobbyBBDD(lobby);
            lobby.players.forEach((p) => {
                crearJugadoresBBDD(lobby.id, p);
            })
            await generatePromptsForPlayers(lobbyCode);
            io.to(lobbyCode).emit('cambiarEscena', GameScreens.START);
        }

    });

    socket.on('newRound', async (lobbyCode) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            await generatePromptsForPlayers(lobbyCode);
            io.to(lobbyCode).emit('cambiarEscena', GameScreens.ANSWER);

        }
    });

    socket.on('playerRanOutOfTimeToAnswer', async (lobbyCode, playerID) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            const playerData = lobby.data.find((d) => d.playerId === playerID);
            if (playerData) {
                const totalPlayerAnswers = playerData.answers.length;
                // Calcular cuántas respuestas de seguridad se necesitan para completar las dos respuestas requeridas
                const remainingSafetyAnswers = 2 - totalPlayerAnswers;
                // Si aún faltan respuestas de seguridad por agregar
                if (remainingSafetyAnswers > 0) {
                    // Llamar a playerUseSafetyAnswer para cada respuesta de seguridad necesaria
                    for (let i = 0; i < remainingSafetyAnswers; i++) {
                        await playerUseSafetyAnswer(lobbyCode, playerID);
                    }
                }
            } else {
                console.error('No se encontraron datos del jugador con ID:', playerID);
            }
        }
    });


    socket.on('loadNextVotingData', (lobbyCode) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {

            socket.emit('getVotingData', lobby.data.prompts);
        }
    });

    socket.on('playerUseSafetyAnswer', async (lobbyCode, playerID) => {
        await playerUseSafetyAnswer(lobbyCode, playerID);
        comprobarNumeroDeRespuestas(lobbyCode);
    });

    socket.on('playerVote', (lobbyCode, playerName, answer) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            const player = lobby.players.find((p) => p.name === playerName);
            if (player) {
                player.score += 100 * lobby.round;
            }
        }
    });

    socket.on('getPlayerPrompts', (lobbyCode, playerID) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            const playerData = lobby.data.find((data) => data.playerId === playerID);
            if (playerData) {
                const playerPrompts = playerData.prompts;
                const textPrompts = [];
                playerPrompts.forEach(objeto => {
                    if (objeto) { // Verificar si el objeto no es undefined
                        console.log('OBJETO:', objeto);
                        textPrompts.push(objeto.text); // Acceder a la propiedad text del objeto
                    }
                });
                socket.emit('getPrompts', textPrompts);
            }
        }
    });


    socket.on('startAnswering', (lobbyCode) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            io.to(lobbyCode).emit('cambiarEscena', GameScreens.ANSWER);
        }
    });

    socket.on('startVoting', (lobbyCode) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            associateAnswersToUniquePrompt(lobby);
            io.to(lobbyCode).emit('cambiarEscena', GameScreens.VOTING);
        }
    });

    socket.on('startResults', (lobbyCode) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            io.to(lobbyCode).emit('cambiarEscena', GameScreens.SCOREBOARD);
        }
    });

    socket.on('startEndGame', (lobbyCode) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            io.to(lobbyCode).emit('cambiarEscena', GameScreens.FINAL_SCREEN);
            const ganador = devolverJugadoresPorPuntuacion(lobby.players)[0];
            const indexGanador = lobby.players.findIndex((p) => p.id === ganador.id);
            console.log('GANADOR: ', indexGanador);
            io.to(lobbyCode).emit('getWinner', indexGanador);
        }
    });


    socket.on('startLobby', (lobbyCode) => {
        const lobby = getLobby(lobbyCode);
        if (lobby) {
            //TODO: Guardar todos los datos en la BBDD y cambiar id de este lobby
            lobby.id = generateUUID();
            lobby.round = 1;
            clearLobbyData(lobby);

            io.to(lobbyCode).emit('cambiarEscena', GameScreens.LOBBY);
        }
    });

});

const closeLobby = (lobbyCode) => {
    const lobby = getLobby(lobbyCode);
    if (lobby) {
        io.to(lobby.code).emit('closeLobby');
    }

    const room = io.sockets.adapter.rooms.get(lobbyCode);


    if (room) {
        // Eliminar la sala de la lista de lobbies
        const index = lobbies.findIndex(lobby => lobby.code === lobbyCode);
        if (index !== -1) {
            lobbies.splice(index, 1);
            console.warn("Sala cerrada:", lobbyCode);
        } else {
            console.error("No se encontró la sala para cerrar:", lobbyCode);
        }
    } else {
        console.error("La sala no existe:", lobbyCode);
    }

}

function generateRandomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const crypto = require("crypto");

function generateUUID() {
    return crypto.randomUUID();
}

const getLobby = (lobbyCode) => lobbies.find((l) => l.code === lobbyCode);


function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

async function generatePromptsForPlayers(lobbyCode, language = 'ES') {
    const lobby = getLobby(lobbyCode);
    if (lobby) {
        try {
            const fetch = (await import('node-fetch')).default;
            const url = `http://localhost:8080/api/prompts/${lobby.game}/${language}`; // Cambiar la URL por la correcta
            const response = await fetch(url);
            if (response.ok) {
                const promptsData = await response.json();

                const lobbySize = lobby.players.length;
                let selectedPrompts = [];
                for (let i = 0; i < lobbySize; i++) {
                    let randIndex = randInt(0, 7);
                    while (selectedPrompts.includes(randIndex)) {
                        randIndex = randInt(0, 7);
                    }
                    selectedPrompts.push(randIndex);
                }

                selectedPrompts = [...selectedPrompts, ...selectedPrompts];

                lobby.players.forEach(playerRef => {

                    const dataArray = {playerId: playerRef.id, prompts: [], answers: []};

                    for (let i = 0; i < 2; i++) {
                        let randIndex = randInt(0, selectedPrompts.length - 1);
                        while (dataArray.prompts.includes(promptsData[selectedPrompts[randIndex]])) {
                            randIndex = randInt(0, 7);
                        }
                        console.log('INDEX: ', randIndex, ' PROMPT: ', promptsData[selectedPrompts[randIndex]]);
                        dataArray.prompts.push(promptsData[selectedPrompts[randIndex]]);
                        selectedPrompts.splice(randIndex, 1);
                    }
                    lobby.data.push(dataArray);

                });
            } else {
                console.error(`Error al obtener las prompts en el idioma ${language}: ${response.status} - ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error al procesar la solicitud:', error);
        }
    } else {
        console.error('No se encontró la sala:', lobbyCode);
    }
}

async function getPromptID(prompt, language = 'ES') {

    const url = `http://localhost:8080/api/prompts/get/${language}/${prompt}`; // Cambiar la URL por la correcta
    const response = await fetch(url);
    if (response.ok) {
        const promptsData = await response.json();
        return promptsData[0]['id_prompt'];
    } else {
        console.error(`Error al obtener las prompts en el idioma ${language}: ${response.status} - ${response.statusText}`);
        return -1;
    }
}

async function crearLobbyBBDD(lobby) {
    const url = `http://localhost:8080/api/lobby/create`;
    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(lobby)
    };
    const response = await fetch(url, requestOptions);
    if (!response.ok) {
        console.error(`Error al registrar sala en la base de datos: ${response.status} - ${response.statusText}`);
    }
}

async function crearJugadoresBBDD(lobbyId, player) {
    const url = `http://localhost:8080/api/players/create`;
    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...player,
            lobbyId: lobbyId
        })
    };
    const response = await fetch(url, requestOptions);
    if (!response.ok) {
        console.error(`Error al registrar sala en la base de datos: ${response.status} - ${response.statusText}`);
    }
}

function clearLobbyData(lobby) {
    //TODO: Guardar en la base de datos
    // Usando la ronda actual y llamarlo al cambio de ronda
    lobby.data = [];
}

function devolverJugadoresPorPuntuacion(jugadores) {
    return jugadores.slice().sort((a, b) => b.score - a.score);
}


async function getRandomSafetyAnswer(id, language = 'ES') {
    const url = `http://localhost:8080/api/safety-answers/${id}/${language}`;
    const response = await fetch(url);
    if (response.ok) {
        const safetyAnswers = await response.json();
        const randomAnswer = Math.floor(Math.random() * 2).toString();
        const randomText = safetyAnswers.find(object => object.id_answer === randomAnswer)?.text;
        return randomText || "Respuesta aleatoria no encontrada para el ID dado";
    } else {
        return "Error al obtener la respuesta de seguridad: " + response.status + " - " + response.statusText;
    }
}


async function playerUseSafetyAnswer(lobbyCode, playerID) {
    const lobby = getLobby(lobbyCode);
    if (lobby) {
        const playerData = lobby.data.find((d) => d.playerId === playerID);
        if (playerData) {
            //TODO Arreglar esto
            const totalPlayerAnswers = playerData.answers.length;
            const playerPrompt = playerData.prompts[totalPlayerAnswers];
            const promptID = await getPromptID(playerPrompt); // Esperar la resolución de la promesa
            if (promptID === -1) {
                console.error('Prompt no encontrado:', playerPrompt);
                return;
            }
            const safetyAnswer = await getRandomSafetyAnswer(promptID); // Esperar la resolución de la promesa
            playerData.answers.push(safetyAnswer);
            console.log(lobby.data);
        } else {
            console.error('No se encontraron datos del jugador con ID:', playerID);
        }
    }
}

function comprobarNumeroDeRespuestas(lobbyCode) {
    const lobby = getLobby(lobbyCode);
    let count = 0;
    lobby.data.forEach((d) => {
        if (d.answers.length === 2) count++;
    });
    if (count === lobby.data.length) {
        io.to(lobbyCode).emit('cambiarEscena', GameScreens.VOTING);
    }
    console.log('CONTADOR DE JUGADORES LISTOS: ', count)
}

function getPromptsUnicos(lobby) {
    const prompts = lobby.data.prompts.slice();
    const promptsUnicos = [];
    prompts.forEach((prompt) => {
        if (!promptsUnicos.includes(prompt)) {
            promptsUnicos.push(prompt);
        }
    });
    return promptsUnicos;
}

function getAnswersDePrompts(lobby, prompt) {
    const answers = lobby.data.answers.slice();
    const answersDePrompts = [];
    answers.forEach((answer) => {
        if (answer === prompt) {
            answersDePrompts.push(answer);
        }
        if (answersDePrompts.length > 2) {
            console.error('EXISTEN MÁS DE 2 RESPUESTAS DE UN MISMO PROMPT: ' + prompt + '\n LOBBY: ' + lobby);
        }
    });
    return answersDePrompts;
}

function associateAnswersToUniquePrompt(lobby) {
    lobby.data.forEach((data) => {
        const promptsUnicos = getPromptsUnicos(lobby);
        const answersDePrompts = [];
        promptsUnicos.forEach((prompt) => {
            answersDePrompts.push(getAnswersDePrompts(lobby, prompt));
        });
        data.answers = answersDePrompts;
    });
    console.log('Datos individualizados: ', lobby.data);
}