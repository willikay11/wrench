'use client';

const CustomGrid = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="grid grid-cols-12">
            <div className="col-start-2 col-span-10">{children}</div>
        </div>
    );
};

export { CustomGrid };