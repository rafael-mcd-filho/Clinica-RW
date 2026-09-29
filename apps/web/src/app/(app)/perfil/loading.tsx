import { Skeleton } from "@/components/ui/loader";
import styles from "./profile.module.css";

export default function Loading() {
  return (
    <div className={styles.profilePage} aria-hidden="true">
      <Skeleton className="h-[60px] rounded-[10px]" />

      <div className={styles.accountHeader}>
        <Skeleton className="size-[88px] shrink-0 rounded-full" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-6 w-44 rounded-md" />
        </div>
      </div>

      <div className={styles.settingsGrid}>
        <div className={styles.gridIntro}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-12 w-full" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div className={styles.settingsCard} key={index}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            </div>
            <Skeleton className="min-h-16 flex-1 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
