"use client";

import { motion } from "framer-motion";

export const AnimatedSection = motion.section;
export const AnimatedDiv = motion.div;

export const fadeInUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function FadeInDiv({
  children,
  delay = 0,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
