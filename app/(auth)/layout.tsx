import { Wordmark } from "@/components/brand/logo";

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-y-8 py-8">
      <Wordmark />
      {children}
    </div>
  );
}

export default AuthLayout;
