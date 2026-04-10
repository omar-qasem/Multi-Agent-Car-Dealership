import { createContext, useContext } from 'react';

export const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);
