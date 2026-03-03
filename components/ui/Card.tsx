interface CardProps {
  children: React.ReactNode;
  hover?: boolean;
  className?: string;
}

export default function Card({ children, hover, className = '' }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 ${
        hover ? 'transition-all duration-200 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-lg' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
