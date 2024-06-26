import React, { useEffect, useState } from 'react';
import Juego from './Juego';
import {CodigoPartida, Contador, IconoJugador, IconoLobby} from "../ComponentesComunes";
import styles from '../../css/Chatbot.module.css';


class Chatbot extends Juego {
  constructor(props) {
    super(props);
    this.state = {
      ...this.state, // Así obtengo los estados de la clase padre
    };
  }



    // Métodos para renderizar diferentes estados del juego
  renderLobby() {
    return (
        <>
            <section className={styles.lobby}>
                <header>
                    <h1>Chatbot</h1>
                    <h2>Código de sala</h2>
                    <CodigoPartida gameCode={this.GameCode}/>
                </header>
                <article className={styles.jugadores}>
                    <ListaUsuarios jugadores={this.state.jugadoresConectados}></ListaUsuarios>
                </article>
            </section>
            <img className={styles.QRcode} id="QRcode" src="" alt="codigoQR"/>
            {/* Hacer un botón para iniciar partida por el Host que arrancará el juego a todos los clientes*/}
            <button className={styles.button} onClick={() => this.setState({estadoJuego: 'respondiendo'})}>Comenzar
            </button>
            <button className={styles.button} onClick={() => this.setState(prevState => ({
                jugadoresConectados: [
                    ...prevState.jugadoresConectados,
                    {nombre: 'Rar', rutaImagen: 'ruta/a/imagen1.png'}
                ]
            }))} disabled={this.state.jugadoresConectados.length >= this.maxJugadores}>Aumentar Jugadores
            </button>
        </>);
  }

    renderRespondiendo() {
        this.state.respuesta = ''

        function enviarRespuesta() {
          // Enviar respuesta al servidor
        }

        return (
          <section id="typing">
            <Contador tiempoInicial={90} />
            <input type="text" value={this.state.respuesta.value} onChange={e => this.setState({ respuesta: e.target.value })} />
            <button className={styles.button} onClick={enviarRespuesta()}>Enviar</button>
            <button className={styles.button} onClick={() => this.setState({ estadoJuego: 'jugando' })} >Juego</button>

          </section>
        );
  }

  renderVotando() {
    return (
      <section id="round">
        <header id="promptHeader">
          <Contador tiempoInicial={10} />
          <IconoLobby gameCode={this.GameCode}/>
        </header>

        <button className={styles.button} onClick={() => this.setState({ estadoJuego: 'inicio' })}>Comenzar</button>
      </section>
    );
  }

  render() {
    // Determinar qué método de renderizado llamar según el estado del juego
    switch (this.state.estadoJuego) {
      case 'inicio':
        return this.renderLobby();
      case 'respondiendo':
        return this.renderRespondiendo();
      case 'jugando':
        return this.renderVotando();
      // Puedes agregar más casos para otros estados del juego si es necesario
      default:
        return null;
    }
  }
}



function ListaUsuarios({ jugadores }) {
  // Estado local para almacenar los jugadores
  const [listaJugadores, setListaJugadores] = useState([]);

  useEffect(() => {
    // Cuando los jugadores cambian, actualiza el estado local
    if (jugadores) {
      setListaJugadores(jugadores);
    } else {
      // Si no hay jugadores, establece la lista como vacía
      setListaJugadores([]);
    }
  }, [jugadores]); // Ejecutar efecto cuando los jugadores cambien

  // Calcular el número de jugadores conectados usando la longitud del array listaJugadores
  const numeroJugadores = listaJugadores.length;

  // Mapear los objetos Jugador para renderizar los IconoJugador
  const iconosJugadores = listaJugadores.map((jugador, index) => (
      <IconoJugador nombreClase={styles.jugador_mostrado} key={index} nombre={jugador.nombre} rutaImagen={jugador.rutaImagen} />
  ));

  // Rellenar los espacios restantes con IconoJugador vacíos
  for (let i = numeroJugadores; i < 8; i++) {
    iconosJugadores.push(
        <IconoJugador nombreClase={styles.jugador_oculto} key={i}/>
    );
  }

  return (
    <>
      {iconosJugadores}
    </>
  );
}


// TODO Componentes para mensaje propio y otro para usuarios ajenos

export default Chatbot;
