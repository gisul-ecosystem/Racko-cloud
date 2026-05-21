"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface DemoModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const DemoModalContext = createContext<DemoModalContextType>({
  isOpen: false,
  openModal: () => {},
  closeModal: () => {},
});

export function DemoModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DemoModalContext.Provider
      value={{
        isOpen,
        openModal: () => setIsOpen(true),
        closeModal: () => setIsOpen(false),
      }}
    >
      {children}
    </DemoModalContext.Provider>
  );
}

export const useDemoModal = () => useContext(DemoModalContext);
