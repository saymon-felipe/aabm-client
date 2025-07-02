import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = 'http://localhost:3000';

function AABMDisplay() {
  const [transcriptions, setTranscriptions] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [serverStatus, setServerStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const transcriptionsEndRef = useRef(null);
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);

  const scrollToBottom = () => {
    transcriptionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const requestResponse = (text, previousTranscriptions) => {
    const context = previousTranscriptions.filter(item => {
      return item.startsWith('FINAL:') || item.startsWith('RESPOSTA:');
    });

    socketRef.current.emit('requestResponse', { text: text, context: context.join(";") });
    console.log("RESPOSTA REQUISITADA AO SERVIDOR");
  };

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Conectado ao servidor Socket.IO!');
      setIsConnected(true);
      setServerStatus('Conectado');
    });

    socket.on('transcriptionResult', (data) => {
      console.log('Transcrição recebida:', data.text, 'Final:', data.isFinal, 'Confiança:', data.confidence);
      setTranscriptions((prevItems) => {
        let newItems = [...prevItems];

        if (data.isFinal) {
          const finalTranscript = `FINAL: ${data.text}`;
          newItems.push(finalTranscript);

          requestResponse(data.text, newItems);

        } else {
          const lastIndex = newItems.length - 1;
          if (lastIndex >= 0 && typeof newItems[lastIndex] === 'string' && newItems[lastIndex].startsWith('PARCIAL:')) {
            newItems[lastIndex] = `PARCIAL: ${data.text}`;
          } else {
            newItems.push(`PARCIAL: ${data.text}`);
          }
        }
        return newItems;
      });
    });

    socket.on('responseResult', (data) => {
      console.log('Resposta recebida:', data.originalText, '->', data.responseText);
      setTranscriptions((prevItems) => {
        let newItems = [...prevItems];
        const indexToInsert = newItems.findIndex(item => item === `FINAL: ${data.originalText}`);

        if (indexToInsert !== -1) {
          newItems.splice(indexToInsert + 1, 0, `RESPOSTA: ${data.responseText}`);
        } else {
          newItems.push(`RESPOSTA: ${data.responseText}`);
        }

        return newItems;
      });
    });

    socket.on('transcriptionError', (errorMsg) => {
      console.error('Erro de transcrição do servidor:', errorMsg);
      setTranscriptions((prevItems) => [...prevItems, `ERRO DO SERVIDOR: ${errorMsg}`]);
    });

    socket.on('status', (msg) => {
      setServerStatus(msg);
    });

    socket.on('disconnect', () => {
      console.log('Desconectado do servidor Socket.IO.');
      setIsConnected(false);
      setServerStatus('Desconectado');
    });

    socket.on('connect_error', (error) => {
      console.error('Erro de conexão:', error);
      setIsConnected(false);
      setServerStatus('Erro de Conexão');
    });

    return () => {
      console.log('Desconectando socket...');
      socket.disconnect();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
    localStorage.setItem("meeting_transcribed", JSON.stringify(transcriptions));
  }, [transcriptions]);

  const startScreenRecording = async () => {
    if (!isConnected) {
      alert('Conecte-se ao servidor primeiro!');
      return;
    }
    if (isRecording) {
      console.warn('Gravação já está em andamento.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true 
      });

      audioStreamRef.current = stream;

      const audioTracks = stream.getAudioTracks();

      if (audioTracks.length === 0) {
        console.error('Nenhuma track de áudio encontrada no stream!');
        stream.getTracks().forEach(track => track.stop()); 
        setIsRecording(false);
        return; 
      }

      console.log('Track de áudio principal:', audioTracks[0]);

      socketRef.current.emit('startTranscription', { language: 'en-US' });

      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('audioChunk', event.data);
          console.log(`Enviando chunk de áudio de ${event.data.size} bytes.`);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        console.log('Gravação de tela parada.');
        setIsRecording(false);
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
        }
        socketRef.current.emit('stopTranscription');
      };

      mediaRecorderRef.current.start(500);
      setIsRecording(true);
      setServerStatus('Gravação de áudio iniciada...');
      console.log('Gravação de áudio da tela iniciada.');

    } catch (err) {
      console.error('Erro ao iniciar a gravação de tela:', err);
      setServerStatus('Erro ao iniciar gravação. Verifique as permissões do navegador e do sistema.');
      setIsRecording(false);
    }
  };

  const stopScreenRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setServerStatus('Gravação de áudio parada.');
    console.log('Gravação de áudio da tela parada.');
  };

  return (
    <div className="aabm-container">
      <p className="aabm-title">AABM (AI-assisted Bilingual Meeting)</p>
      <p className="aabm-status-line">
        Status da Conexão: <strong className={isConnected ? 'status-connected' : 'status-disconnected'}>{serverStatus}</strong>
      </p>
      <div className="aabm-buttons-container">
        <button
          onClick={startScreenRecording}
          disabled={!isConnected || isRecording}
          className="aabm-button aabm-button-start"
          style={{ cursor: (!isConnected || isRecording) ? 'not-allowed' : 'pointer' }}
        >
          Iniciar Transcrição (Gravação Tela)
        </button>
        <button
          onClick={stopScreenRecording}
          disabled={!isConnected || !isRecording}
          className="aabm-button aabm-button-stop"
          style={{ cursor: (!isConnected || !isRecording) ? 'not-allowed' : 'pointer' }}
        >
          Parar Transcrição
        </button>
      </div>

      <div className="aabm-transcription-box">
        <ul className="aabm-transcription-list">
          {
            transcriptions.map((item, index) => {
              const isPartial = item.startsWith('PARCIAL:');
              const isFinal = item.startsWith('FINAL:');
              const isResponse = item.startsWith('RESPOSTA:');

              let content = item;
              let itemClass = 'aabm-transcription-item'; // Classe base

              if (isPartial) {
                content = item.substring('PARCIAL: '.length);
                itemClass += ' aabm-partial';
              } else if (isFinal) {
                content = item.substring('FINAL: '.length);
                itemClass += ' aabm-final';
              } else if (isResponse) {
                content = item.substring('RESPOSTA: '.length);
                itemClass += ' aabm-response';
              }

              return (
                <li
                  key={index}
                  className={itemClass}
                >
                  {content}
                </li>
              );
            })
          }
          <div ref={transcriptionsEndRef} />
        </ul>
      </div>
    </div>
  );
}

export default AABMDisplay;