'use client';

const CustomGrid = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="grid grid-cols-12">
            <div className="col-start-2 col-span-10 lg:col-start-2 lg:col-span-10 xl:col-start-2 xl:col-span-10 2xl:col-start-3 2xl:col-span-8">{children}</div>
        </div>
    );
};

export { CustomGrid };